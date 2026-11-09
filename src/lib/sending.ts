import "server-only";
import { and, count, eq, inArray, lt, sql } from "drizzle-orm";
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
import { postUrl, publicationUrl, unsubscribeOneClickUrl, unsubscribePageUrl } from "@/lib/urls";

type Post = typeof posts.$inferSelect;
type Publication = typeof publications.$inferSelect;

/** Claimed deliveries older than this are assumed to belong to a crashed worker. */
const STALE_CLAIM = "15 minutes";

/** Render once per post. The unsubscribe link is a placeholder filled in per recipient. */
export async function renderPostEmail(post: Post, publication: Publication) {
  return getEmailRenderer(post.contentFormat).render({
    post,
    publication,
    urls: {
      publication: publicationUrl(publication.slug),
      webVersion: postUrl(publication.slug, post.slug),
      unsubscribe: UNSUBSCRIBE_URL_PLACEHOLDER,
    },
  });
}

function personalize(rendered: RenderedEmail, unsubscribeUrl: string): RenderedEmail {
  return {
    html: rendered.html.replaceAll(UNSUBSCRIBE_URL_PLACEHOLDER, unsubscribeUrl),
    text: rendered.text.replaceAll(UNSUBSCRIBE_URL_PLACEHOLDER, unsubscribeUrl),
  };
}

export async function sendTestEmail(post: Post, publication: Publication, to: string) {
  const rendered = personalize(
    await renderPostEmail(post, publication),
    publicationUrl(publication.slug),
  );
  await sendEmail({
    to,
    from: fromWithName(publication.fromName),
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
          ),
        )
        .returning({ id: posts.id, audience: posts.audience });
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
      const queued = await tx.execute<{ id: string }>(sql`
        insert into ${deliveries} (post_id, subscriber_id)
        select ${postId}, s.id from ${subscribers} s
        where s.publication_id = ${publicationId} and s.status = 'active'
          and (${!tagged} or exists (
            select 1 from ${subscriberTags} st
            join ${postAudienceTags} pat on pat.tag_id = st.tag_id
            where pat.post_id = ${postId} and st.subscriber_id = s.id
          ))
        on conflict do nothing
        returning id
      `);
      if (queued.length === 0) {
        throw new SendBlocked(
          tagged
            ? "Nobody on your list has the tags this post is going to."
            : "You don't have any confirmed subscribers yet.",
        );
      }

      const blocked = limitBlocker(usage, queued.length);
      if (blocked) throw new SendBlocked(blocked);
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

  const rendered = await renderPostEmail(post, publication);
  const transport = batchTransport();
  const from = fromWithName(publication.fromName);

  for (;;) {
    // Paused mid-send (an admin, or the automatic spam-report check): stop here.
    const [state] = await db
      .select({ suspendedAt: publications.suspendedAt })
      .from(publications)
      .where(eq(publications.id, publication.id));
    if (state?.suspendedAt) return;

    const claimed = await db.execute<{ id: string; subscriber_id: string }>(sql`
      update ${deliveries} set status = 'sending', updated_at = now()
      where id in (
        select id from ${deliveries}
        where post_id = ${postId} and status = 'queued'
        order by id
        limit ${transport.maxBatchSize}
        for update skip locked
      )
      returning id, subscriber_id
    `);
    if (claimed.length === 0) break;

    const recipients = await db
      .select({
        id: subscribers.id,
        email: subscribers.email,
        status: subscribers.status,
        unsubscribeToken: subscribers.unsubscribeToken,
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
    for (const { id, subscriber_id } of claimed) {
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
          subject: post.title,
          ...personalize(rendered, unsubscribePageUrl(recipient.unsubscribeToken)),
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

  // Done once nothing is queued or in flight.
  const [{ remaining }] = await db
    .select({ remaining: count() })
    .from(deliveries)
    .where(and(eq(deliveries.postId, postId), inArray(deliveries.status, ["queued", "sending"])));
  if (remaining === 0) {
    await db
      .update(posts)
      .set({ status: "sent" })
      .where(and(eq(posts.id, postId), eq(posts.status, "sending")));
    // The post now appears in the public archive. (Works from requests and from the scheduler.)
    await revalidatePublicTag(publicationTag(publication.slug)).catch((e) =>
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
    total: 0,
  };
  for (const { status, n } of rows) {
    stats[status] = n;
    stats.total += n;
  }
  return stats;
}
