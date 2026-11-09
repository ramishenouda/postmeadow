import "server-only";
import { and, count, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { revalidatePublicTag } from "@/lib/revalidate";
import { db } from "@/db";
import {
  deliveries,
  deliveryLinkClicks,
  postAudienceTags,
  posts,
  publications,
  subscribers,
  subscriberTags,
} from "@/db/schema";
import { publicationTag } from "@/lib/cache-tags";
import {
  getEmailRenderer,
  UNSUBSCRIBE_URL_PLACEHOLDER,
  type RenderedEmail,
} from "@/lib/email/renderers";
import { batchTransport, fromWithName, sendEmail, type EmailMessage } from "@/lib/email/send";
import { accountUsage, limitBlocker, recordEmails } from "@/lib/limits";
import { liveDomain } from "@/lib/domains";
import { senderAddress } from "@/lib/email/sender-domains";
import {
  postUrl,
  publicationUrl,
  unsubscribeOneClickUrl,
  unsubscribePageUrl,
  upgradeUrl,
} from "@/lib/urls";
import { hasPaidAccess } from "@/lib/paid";
import { paywalledMarkdown } from "@/lib/paid-preview";

type Post = typeof posts.$inferSelect;
type Publication = typeof publications.$inferSelect;

/** Claimed deliveries older than this are assumed to belong to a crashed worker. */
const STALE_CLAIM = "15 minutes";

/**
 * Render once per post. The unsubscribe link is a placeholder filled in per recipient.
 * `webSlug` is the post whose web page "view in browser" opens (a resend's original).
 */
export async function renderPostEmail(post: Post, publication: Publication, webSlug = post.slug) {
  return getEmailRenderer(post.contentFormat).render({
    post,
    publication,
    urls: {
      publication: publicationUrl(publication.slug, liveDomain(publication)),
      webVersion: postUrl(publication.slug, webSlug, liveDomain(publication)),
      unsubscribe: UNSUBSCRIBE_URL_PLACEHOLDER,
    },
  });
}

/** A/B tests need enough people in each half for the result to mean something. */
export const AB_MIN_RECIPIENTS = 100;
export const AB_TEST_PERCENTS = [10, 20, 30, 50] as const;
export const AB_WAIT_HOURS = [1, 2, 4, 8, 24] as const;

/** The subject a recipient gets: their test variant's, or the winner's for everyone else. */
export function subjectFor(
  post: Pick<Post, "title" | "subjectB" | "abWinner">,
  variant: string | null,
): string {
  const b = post.subjectB?.trim();
  if (!b) return post.title;
  const pick = variant ?? post.abWinner;
  return pick === "b" ? b : post.title;
}

export function personalize(rendered: RenderedEmail, unsubscribeUrl: string): RenderedEmail {
  return {
    html: rendered.html.replaceAll(UNSUBSCRIBE_URL_PLACEHOLDER, unsubscribeUrl),
    text: rendered.text.replaceAll(UNSUBSCRIBE_URL_PLACEHOLDER, unsubscribeUrl),
  };
}

export async function sendTestEmail(post: Post, publication: Publication, to: string) {
  const rendered = personalize(
    await renderPostEmail(post, publication),
    publicationUrl(publication.slug, liveDomain(publication)),
  );
  await sendEmail({
    to,
    from: fromWithName(publication.fromName, senderAddress(publication)),
    replyTo: publication.replyTo ?? undefined,
    subject: `[Test] ${post.title}`,
    ...rendered,
  });
}

/** A send that isn't allowed: the post stays as it was (draft or scheduled). */
class SendBlocked extends Error {}

export type QueueResult = { queued: number } | { blocked: string } | null;

/**
 * The one gate every send goes through ("Send now" and scheduled sends): checks the
 * publication may send (not suspended, postal address set), picks the audience, and
 * checks the plan's limits, then marks the post as sending and queues one delivery
 * per recipient. All or nothing, in one transaction.
 *
 * Returns null if the post is no longer draft/scheduled (someone else took it).
 */
export async function queuePost(postId: string, publicationId: string): Promise<QueueResult> {
  const [publication] = await db
    .select({
      ownerId: publications.ownerId,
      suspendedAt: publications.suspendedAt,
      postalAddress: publications.postalAddress,
    })
    .from(publications)
    .where(eq(publications.id, publicationId));
  if (!publication) return null;
  const usage = await accountUsage(publication.ownerId);

  try {
    return await db.transaction(async (tx) => {
      const [locked] = await tx
        .update(posts)
        .set({ status: "sending", publishedAt: new Date(), scheduledAt: null, sendError: null })
        .where(
          and(
            eq(posts.id, postId),
            eq(posts.publicationId, publicationId),
            inArray(posts.status, ["draft", "scheduled"]),
            eq(posts.kind, "issue"),
          ),
        )
        .returning({
          id: posts.id,
          audience: posts.audience,
          resendOf: posts.resendOf,
          abMetric: posts.abMetric,
          subjectB: posts.subjectB,
          abTestPercent: posts.abTestPercent,
          abWaitHours: posts.abWaitHours,
        });
      if (!locked) return null;

      if (publication.suspendedAt) {
        throw new SendBlocked(
          "Sending is paused on this account. Reply to any email from us, or contact support, to sort it out.",
        );
      }
      if (!publication.postalAddress?.trim()) {
        throw new SendBlocked(
          "Add your postal address in Settings first. The law requires one in every newsletter, and it appears in the footer.",
        );
      }

      const tagged = locked.audience === "tags";
      const paidOnly = locked.audience === "paid";
      const queued = locked.resendOf
        ? // A resend: still-subscribed people who got the original but didn't open or click it.
          await tx.execute<{ id: string }>(sql`
            insert into ${deliveries} (post_id, subscriber_id)
            select ${postId}, s.id from ${subscribers} s
            join ${deliveries} d on d.subscriber_id = s.id and d.post_id = ${locked.resendOf}
            where s.status = 'active' and d.status = 'sent'
              and (s.paused_until is null or s.paused_until <= now())
              and d.opened_at is null and d.clicked_at is null
            on conflict do nothing
            returning id
          `)
        : await tx.execute<{ id: string }>(sql`
            insert into ${deliveries} (post_id, subscriber_id)
            select ${postId}, s.id from ${subscribers} s
            where s.publication_id = ${publicationId} and s.status = 'active'
              and (s.paused_until is null or s.paused_until <= now())
              and (${!tagged} or exists (
                select 1 from ${subscriberTags} st
                join ${postAudienceTags} pat on pat.tag_id = st.tag_id
                where pat.post_id = ${postId} and st.subscriber_id = s.id
              ))
              and (${!paidOnly} or s.paid_status = 'active'
                or (s.paid_status = 'past_due' and s.paid_until > now()))
            on conflict do nothing
            returning id
          `);
      if (queued.length === 0) {
        throw new SendBlocked(
          locked.resendOf
            ? "Everyone who got the original has opened it (or left)."
            : tagged
              ? "Nobody on your list has the tags this post is going to."
              : paidOnly
                ? "You don't have any paid subscribers yet."
                : "You don't have any confirmed subscribers yet.",
        );
      }

      const blocked = limitBlocker(usage, queued.length);
      if (blocked) throw new SendBlocked(blocked);

      if (locked.abMetric && locked.subjectB?.trim() && !locked.resendOf) {
        if (queued.length < AB_MIN_RECIPIENTS) {
          throw new SendBlocked(
            `A/B tests need at least ${AB_MIN_RECIPIENTS} recipients. Turn the test off to send to ${queued.length}.`,
          );
        }
        // A random sample, split in two, goes now; the rest waits for the winner.
        const half = Math.max(1, Math.floor((queued.length * locked.abTestPercent) / 100 / 2));
        await tx.execute(sql`
          with ranked as (
            select id, row_number() over (order by random()) as rn
            from ${deliveries} where post_id = ${postId}
          )
          update ${deliveries} d set
            variant = case when r.rn <= ${half} then 'a' when r.rn <= ${half * 2} then 'b' end,
            status = (case when r.rn <= ${half * 2} then 'queued' else 'held' end)::delivery_status
          from ranked r where d.id = r.id
        `);
        await tx
          .update(posts)
          .set({
            abWinner: null,
            abDecideAt: new Date(Date.now() + locked.abWaitHours * 60 * 60 * 1000),
          })
          .where(eq(posts.id, postId));
      }

      await recordEmails(tx, publication.ownerId, queued.length);
      return { queued: queued.length };
    });
  } catch (error) {
    if (error instanceof SendBlocked) return { blocked: error.message };
    throw error;
  }
}

/**
 * Sends every queued delivery for a post, in batches. Safe to call more than once
 * at the same time (rows are claimed with SKIP LOCKED) and safe to call again
 * after a crash (stale claims are put back in the queue).
 */
/** Sends running in this process, so the scheduler doesn't start a second one. */
const running = new Map<string, Promise<void>>();

export const isSendRunning = (postId: string) => running.has(postId);

export function processDeliveries(postId: string): Promise<void> {
  const existing = running.get(postId);
  if (existing) return existing;
  const run = processDeliveriesOnce(postId).finally(() => running.delete(postId));
  running.set(postId, run);
  return run;
}

async function processDeliveriesOnce(postId: string): Promise<void> {
  const [row] = await db
    .select({ post: posts, publication: publications })
    .from(posts)
    .innerJoin(publications, eq(posts.publicationId, publications.id))
    .where(eq(posts.id, postId));
  if (!row || row.post.status !== "sending") return;
  const { post, publication } = row;
  // A paused publication sends nothing more; the rest stays queued until it's resumed.
  if (publication.suspendedAt) return;

  // Re-queue rows claimed by a worker that died mid-batch.
  await db
    .update(deliveries)
    .set({ status: "queued" })
    .where(
      and(
        eq(deliveries.postId, postId),
        eq(deliveries.status, "sending"),
        lt(deliveries.updatedAt, sql`now() - ${STALE_CLAIM}::interval`),
      ),
    );

  // Nothing to send right now (e.g. an A/B test waiting for its winner): skip rendering.
  const [{ waiting }] = await db
    .select({ waiting: count() })
    .from(deliveries)
    .where(and(eq(deliveries.postId, postId), inArray(deliveries.status, ["queued", "sending"])));
  if (waiting === 0) return finishIfDone(postId, publication.slug);

  let webSlug = post.slug;
  if (post.resendOf) {
    const [original] = await db
      .select({ slug: posts.slug })
      .from(posts)
      .where(eq(posts.id, post.resendOf));
    if (original) webSlug = original.slug;
  }
  const rendered = await renderPostEmail(post, publication, webSlug);
  // A paid post: free readers get the beginning and an "upgrade" button.
  const preview = post.paid
    ? await renderPostEmail(
        {
          ...post,
          content: paywalledMarkdown(
            post.content,
            upgradeUrl(publication.slug, liveDomain(publication)),
            publication.name,
          ),
        },
        publication,
        webSlug,
      )
    : rendered;
  const transport = batchTransport();
  const from = fromWithName(publication.fromName, senderAddress(publication));

  for (;;) {
    // Paused mid-send (an admin, or the automatic spam-report check): stop here.
    const [state] = await db
      .select({ suspendedAt: publications.suspendedAt })
      .from(publications)
      .where(eq(publications.id, publication.id));
    if (state?.suspendedAt) return;

    const claimed = await db.execute<{
      id: string;
      subscriber_id: string;
      variant: string | null;
    }>(sql`
      update ${deliveries} set status = 'sending', updated_at = now()
      where id in (
        select id from ${deliveries}
        where post_id = ${postId} and status = 'queued'
        order by id
        limit ${transport.maxBatchSize}
        for update skip locked
      )
      returning id, subscriber_id, variant
    `);
    if (claimed.length === 0) break;

    const recipients = await db
      .select({
        id: subscribers.id,
        email: subscribers.email,
        status: subscribers.status,
        unsubscribeToken: subscribers.unsubscribeToken,
        paidStatus: subscribers.paidStatus,
        paidUntil: subscribers.paidUntil,
      })
      .from(subscribers)
      .where(
        inArray(
          subscribers.id,
          claimed.map((c) => c.subscriber_id),
        ),
      );
    const byId = new Map(recipients.map((r) => [r.id, r]));

    // People can unsubscribe while a send is in progress; skip them.
    const toSend: { deliveryId: string; message: EmailMessage }[] = [];
    const skipped: string[] = [];
    for (const { id, subscriber_id, variant } of claimed) {
      const recipient = byId.get(subscriber_id);
      if (!recipient || recipient.status !== "active") {
        skipped.push(id);
        continue;
      }
      const oneClick = unsubscribeOneClickUrl(recipient.unsubscribeToken);
      toSend.push({
        deliveryId: id,
        message: {
          to: recipient.email,
          from,
          replyTo: publication.replyTo ?? undefined,
          subject: subjectFor(post, variant),
          ...personalize(
            hasPaidAccess(recipient) ? rendered : preview,
            unsubscribePageUrl(recipient.unsubscribeToken),
          ),
          headers: {
            "List-Unsubscribe": `<${oneClick}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        },
      });
    }

    const results = toSend.length ? await transport.sendBatch(toSend.map((s) => s.message)) : [];
    const now = new Date();

    await db.transaction(async (tx) => {
      if (skipped.length) {
        await tx
          .update(deliveries)
          .set({ status: "failed", error: "Skipped: no longer subscribed" })
          .where(inArray(deliveries.id, skipped));
      }
      for (const [i, result] of results.entries()) {
        await tx
          .update(deliveries)
          .set(
            result.ok
              ? { status: "sent", providerMessageId: result.id, sentAt: now, error: null }
              : { status: "failed", error: result.error.slice(0, 500) },
          )
          .where(eq(deliveries.id, toSend[i].deliveryId));
      }
    });

    if (transport.batchDelayMs) await new Promise((r) => setTimeout(r, transport.batchDelayMs));
  }

  await finishIfDone(postId, publication.slug);
}

/** Marks the post sent once nothing is queued, in flight or held for an A/B test. */
async function finishIfDone(postId: string, publicationSlug: string) {
  const [{ remaining }] = await db
    .select({ remaining: count() })
    .from(deliveries)
    .where(
      and(eq(deliveries.postId, postId), inArray(deliveries.status, ["queued", "sending", "held"])),
    );
  if (remaining === 0) {
    await db
      .update(posts)
      .set({ status: "sent" })
      .where(and(eq(posts.id, postId), eq(posts.status, "sending")));
    // The post now appears in the public archive. (Works from requests and from the scheduler.)
    await revalidatePublicTag(publicationTag(publicationSlug)).catch((e) =>
      console.error("archive refresh failed; it updates within minutes anyway", e),
    );
  }
}

/** Opens, clicks and the most-clicked links for a sent post. */
export async function engagementStats(postId: string) {
  const [[totals], topLinks] = await Promise.all([
    db
      .select({
        // Delivered = accepted by the provider and not bounced (spam reports were delivered).
        delivered: sql<number>`count(*) filter (where ${deliveries.status} in ('sent', 'complained'))::int`,
        opened: sql<number>`count(${deliveries.openedAt})::int`,
        clicked: sql<number>`count(${deliveries.clickedAt})::int`,
      })
      .from(deliveries)
      .where(eq(deliveries.postId, postId)),
    db
      .select({
        url: deliveryLinkClicks.url,
        clicks: sql<number>`sum(${deliveryLinkClicks.clicks})::int`,
        people: sql<number>`count(*)::int`,
      })
      .from(deliveryLinkClicks)
      .innerJoin(deliveries, eq(deliveryLinkClicks.deliveryId, deliveries.id))
      .where(eq(deliveries.postId, postId))
      .groupBy(deliveryLinkClicks.url)
      .orderBy(sql`count(*) desc`, sql`sum(${deliveryLinkClicks.clicks}) desc`)
      .limit(10),
  ]);
  const rate = (n: number) =>
    totals.delivered ? Math.round((n / totals.delivered) * 1000) / 10 : 0;
  return {
    ...totals,
    openRate: rate(totals.opened),
    clickRate: rate(totals.clicked),
    topLinks,
  };
}

/**
 * Picks an A/B test's winner (by its metric; a tie goes to A) and releases everyone
 * else to it. Returns the winner, or null if the test was already decided.
 */
export async function decideAbTest(postId: string, forced?: "a" | "b"): Promise<"a" | "b" | null> {
  const [post] = await db
    .select({ abMetric: posts.abMetric, abWinner: posts.abWinner, status: posts.status })
    .from(posts)
    .where(eq(posts.id, postId));
  if (!post || !post.abMetric || post.abWinner || post.status !== "sending") return null;
  let winner = forced;
  if (!winner) {
    const results = await abResults(postId);
    const metric = post.abMetric === "clicks" ? "clickRate" : "openRate";
    winner = results.b[metric] > results.a[metric] ? "b" : "a";
  }
  const decided = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(posts)
      .set({ abWinner: winner, abDecideAt: new Date() })
      .where(and(eq(posts.id, postId), isNull(posts.abWinner)))
      .returning({ id: posts.id });
    if (!claimed) return false;
    await tx
      .update(deliveries)
      .set({ status: "queued" })
      .where(and(eq(deliveries.postId, postId), eq(deliveries.status, "held")));
    return true;
  });
  return decided ? winner : null;
}

export type AbVariantResult = {
  delivered: number;
  opened: number;
  clicked: number;
  openRate: number;
  clickRate: number;
};

/** Opens and clicks for each half of an A/B test's sample. */
export async function abResults(postId: string): Promise<Record<"a" | "b", AbVariantResult>> {
  const rows = await db
    .select({
      variant: deliveries.variant,
      delivered: sql<number>`count(*) filter (where ${deliveries.status} in ('sent', 'complained'))::int`,
      opened: sql<number>`count(${deliveries.openedAt})::int`,
      clicked: sql<number>`count(${deliveries.clickedAt})::int`,
    })
    .from(deliveries)
    .where(and(eq(deliveries.postId, postId), isNotNull(deliveries.variant)))
    .groupBy(deliveries.variant);
  const empty = { delivered: 0, opened: 0, clicked: 0, openRate: 0, clickRate: 0 };
  const out = { a: { ...empty }, b: { ...empty } };
  for (const r of rows) {
    if (r.variant !== "a" && r.variant !== "b") continue;
    const rate = (n: number) => (r.delivered ? Math.round((n / r.delivered) * 1000) / 10 : 0);
    out[r.variant] = { ...r, openRate: rate(r.opened), clickRate: rate(r.clicked) };
  }
  return out;
}

export async function deliveryStats(postId: string) {
  const rows = await db
    .select({ status: deliveries.status, n: count() })
    .from(deliveries)
    .where(eq(deliveries.postId, postId))
    .groupBy(deliveries.status);
  const stats = {
    queued: 0,
    sending: 0,
    sent: 0,
    failed: 0,
    bounced: 0,
    complained: 0,
    held: 0,
    total: 0,
  };
  for (const { status, n } of rows) {
    stats[status] = n;
    stats.total += n;
  }
  return stats;
}
