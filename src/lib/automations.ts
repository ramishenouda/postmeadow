import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  automationRuns,
  automations,
  automationSteps,
  deliveries,
  posts,
  publications,
  subscribers,
  subscriberTags,
} from "@/db/schema";
import {
  getEmailRenderer,
  UNSUBSCRIBE_URL_PLACEHOLDER,
  type RenderedEmail,
} from "@/lib/email/renderers";
import { fromWithName, sendEmail } from "@/lib/email/send";
import { accountUsage, limitBlocker, recordEmails } from "@/lib/limits";
import { reportError } from "@/lib/report";
import { personalize } from "@/lib/sending";
import { liveDomain } from "@/lib/domains";
import { senderAddress } from "@/lib/email/sender-domains";
import { publicationUrl, unsubscribeOneClickUrl, unsubscribePageUrl } from "@/lib/urls";

/**
 * Automations: email series sent on their own.
 *
 * Triggers: "subscribed" (someone confirms, accepts an invitation or subscribes from a
 * recommendation) and "tag_added" (an active subscriber gets the automation's tag;
 * also checked when someone who got tags at sign-up confirms).
 *
 * Each subscriber goes through an automation at most once (automation_runs). The
 * scheduler calls runAutomations() every tick; due runs are leased with SKIP LOCKED,
 * and each email is a `deliveries` row (unique per post and subscriber), so a crash
 * or a second server never sends a step twice.
 */

export const TRIGGERS = {
  subscribed: "When someone subscribes",
  tag_added: "When a subscriber gets a tag",
} as const;
export type Trigger = keyof typeof TRIGGERS;
export const isTrigger = (v: string): v is Trigger => v in TRIGGERS;

export const MAX_STEPS = 20;
export const MAX_AUTOMATIONS = 20;
const LEASE = "10 minutes";

/** Starts these subscribers on an automation (if it has steps). Already-enrolled are skipped. */
async function enroll(automationId: string, subscriberIds: string[]) {
  if (subscriberIds.length === 0) return;
  const [first] = await db
    .select({ delayHours: automationSteps.delayHours })
    .from(automationSteps)
    .where(eq(automationSteps.automationId, automationId))
    .orderBy(asc(automationSteps.position))
    .limit(1);
  if (!first) return;
  const nextAt = new Date(Date.now() + first.delayHours * 3600_000);
  for (let i = 0; i < subscriberIds.length; i += 1000) {
    await db
      .insert(automationRuns)
      .values(
        subscriberIds
          .slice(i, i + 1000)
          .map((subscriberId) => ({ automationId, subscriberId, nextAt })),
      )
      .onConflictDoNothing();
  }
}

/** Someone just became an active subscriber. */
export async function enrollOnConfirm(subscriberId: string) {
  const [subscriber] = await db
    .select({ publicationId: subscribers.publicationId, status: subscribers.status })
    .from(subscribers)
    .where(eq(subscribers.id, subscriberId));
  if (!subscriber || subscriber.status !== "active") return;
  const list = await db
    .select({ id: automations.id, trigger: automations.trigger, tagId: automations.triggerTagId })
    .from(automations)
    .where(
      and(eq(automations.publicationId, subscriber.publicationId), eq(automations.active, true)),
    );
  if (list.length === 0) return;
  const tagRows = await db
    .select({ tagId: subscriberTags.tagId })
    .from(subscriberTags)
    .where(eq(subscriberTags.subscriberId, subscriberId));
  const theirTags = new Set(tagRows.map((t) => t.tagId));
  for (const a of list) {
    if (
      a.trigger === "subscribed" ||
      (a.trigger === "tag_added" && a.tagId && theirTags.has(a.tagId))
    ) {
      await enroll(a.id, [subscriberId]);
    }
  }
}

/** Tags were just added to these subscribers: start the matching automations (active people only). */
export async function enrollOnTags(subscriberIds: string[], tagIds: string[]) {
  if (subscriberIds.length === 0 || tagIds.length === 0) return;
  const list = await db
    .select({
      id: automations.id,
      tagId: automations.triggerTagId,
      publicationId: automations.publicationId,
    })
    .from(automations)
    .where(
      and(
        eq(automations.active, true),
        eq(automations.trigger, "tag_added"),
        inArray(automations.triggerTagId, tagIds),
      ),
    );
  for (const a of list) {
    for (let i = 0; i < subscriberIds.length; i += 5000) {
      const active = await db
        .select({ id: subscribers.id })
        .from(subscribers)
        .where(
          and(
            inArray(subscribers.id, subscriberIds.slice(i, i + 5000)),
            eq(subscribers.publicationId, a.publicationId),
            eq(subscribers.status, "active"),
          ),
        );
      await enroll(
        a.id,
        active.map((s) => s.id),
      );
    }
  }
}

type Due = { id: string; automation_id: string; subscriber_id: string; next_step: number };

/** Sends every automation email that's due. Called by the scheduler. */
export async function runAutomations(): Promise<number> {
  // Lease due runs so another server (or the next tick) leaves them alone.
  const due = await db.execute<Due>(sql`
    update ${automationRuns} set next_at = now() + ${LEASE}::interval, updated_at = now()
    where id in (
      select id from ${automationRuns}
      where status = 'active' and next_at <= now()
      order by next_at
      limit 100
      for update skip locked
    )
    returning id, automation_id, subscriber_id, next_step
  `);
  const rendered = new Map<string, RenderedEmail>();
  let sent = 0;
  for (const run of due) {
    try {
      if (await advance(run, rendered)) sent++;
    } catch (error) {
      reportError("automation step failed", error, { runId: run.id });
    }
  }
  return sent;
}

const later = (runId: string, at: Date) =>
  db.update(automationRuns).set({ nextAt: at }).where(eq(automationRuns.id, runId));

async function advance(run: Due, rendered: Map<string, RenderedEmail>): Promise<boolean> {
  const [row] = await db
    .select({ automation: automations, publication: publications })
    .from(automations)
    .innerJoin(publications, eq(publications.id, automations.publicationId))
    .where(eq(automations.id, run.automation_id));
  if (!row) return false;
  const { automation, publication } = row;
  // Turned off, or the account can't send right now: try again later.
  if (!automation.active || publication.suspendedAt || !publication.postalAddress?.trim()) {
    await later(run.id, new Date(Date.now() + 3600_000));
    return false;
  }

  const steps = await db
    .select({
      id: automationSteps.id,
      delayHours: automationSteps.delayHours,
      postId: automationSteps.postId,
    })
    .from(automationSteps)
    .where(eq(automationSteps.automationId, automation.id))
    .orderBy(asc(automationSteps.position));
  const step = steps[run.next_step];
  if (!step) {
    await db.update(automationRuns).set({ status: "done" }).where(eq(automationRuns.id, run.id));
    return false;
  }

  const [subscriber] = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.id, run.subscriber_id));
  if (!subscriber || subscriber.status !== "active") {
    await db.update(automationRuns).set({ status: "stopped" }).where(eq(automationRuns.id, run.id));
    return false;
  }
  if (subscriber.pausedUntil && subscriber.pausedUntil > new Date()) {
    await later(run.id, subscriber.pausedUntil);
    return false;
  }

  const usage = await accountUsage(publication.ownerId);
  if (limitBlocker(usage, 1)) {
    await later(run.id, new Date(Date.now() + 6 * 3600_000));
    return false;
  }

  // Claim this email; if it already exists, it went out before (crash after sending).
  const [delivery] = await db
    .insert(deliveries)
    .values({ postId: step.postId, subscriberId: subscriber.id, status: "sending" })
    .onConflictDoNothing()
    .returning({ id: deliveries.id });

  if (delivery) {
    const [post] = await db.select().from(posts).where(eq(posts.id, step.postId));
    if (!post) return false;
    let email = rendered.get(post.id);
    if (!email) {
      email = await getEmailRenderer(post.contentFormat).render({
        post,
        publication,
        urls: {
          publication: publicationUrl(publication.slug, liveDomain(publication)),
          // Automation emails aren't on the web; "view in browser" opens the publication.
          webVersion: publicationUrl(publication.slug, liveDomain(publication)),
          unsubscribe: UNSUBSCRIBE_URL_PLACEHOLDER,
        },
      });
      rendered.set(post.id, email);
    }
    try {
      const result = await sendEmail({
        to: subscriber.email,
        from: fromWithName(publication.fromName, senderAddress(publication)),
        replyTo: publication.replyTo ?? undefined,
        subject: post.title,
        ...personalize(email, unsubscribePageUrl(subscriber.unsubscribeToken)),
        headers: {
          "List-Unsubscribe": `<${unsubscribeOneClickUrl(subscriber.unsubscribeToken)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      await db
        .update(deliveries)
        .set({ status: "sent", providerMessageId: result.id, sentAt: new Date() })
        .where(eq(deliveries.id, delivery.id));
      await recordEmails(db, publication.ownerId, 1);
    } catch (error) {
      await db
        .update(deliveries)
        .set({ status: "failed", error: String(error).slice(0, 500) })
        .where(eq(deliveries.id, delivery.id));
      reportError("automation email failed", error, { postId: post.id });
    }
  }

  const next = steps[run.next_step + 1];
  await db
    .update(automationRuns)
    .set(
      next
        ? { nextStep: run.next_step + 1, nextAt: new Date(Date.now() + next.delayHours * 3600_000) }
        : { nextStep: run.next_step + 1, status: "done" },
    )
    .where(eq(automationRuns.id, run.id));
  return Boolean(delivery);
}

/** Per step: sent, opened and clicked, for the automation page. */
export async function stepStats(postIds: string[]) {
  if (postIds.length === 0)
    return new Map<string, { sent: number; opened: number; clicked: number }>();
  const rows = await db
    .select({
      postId: deliveries.postId,
      sent: sql<number>`count(*) filter (where ${deliveries.status} in ('sent','complained'))::int`,
      opened: sql<number>`count(${deliveries.openedAt})::int`,
      clicked: sql<number>`count(${deliveries.clickedAt})::int`,
    })
    .from(deliveries)
    .where(inArray(deliveries.postId, postIds))
    .groupBy(deliveries.postId);
  return new Map(rows.map((r) => [r.postId, r]));
}

/** People in an automation: still going, finished, stopped (unsubscribed). */
export async function runCounts(automationId: string) {
  const rows = await db
    .select({ status: automationRuns.status, n: sql<number>`count(*)::int` })
    .from(automationRuns)
    .where(eq(automationRuns.automationId, automationId))
    .groupBy(automationRuns.status);
  const out = { active: 0, done: 0, stopped: 0 };
  for (const r of rows) if (r.status in out) out[r.status as keyof typeof out] = r.n;
  return out;
}
