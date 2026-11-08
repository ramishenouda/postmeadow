import "server-only";
import { and, count, eq, inArray, lt, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { db } from "@/db";
import { deliveries, posts, publications, subscribers } from "@/db/schema";
import { publicationTag } from "@/lib/cache-tags";
import {
  getEmailRenderer,
  UNSUBSCRIBE_URL_PLACEHOLDER,
  type RenderedEmail,
} from "@/lib/email/renderers";
import { batchTransport, fromWithName, sendEmail, type EmailMessage } from "@/lib/email/send";
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

/**
 * Locks the post (draft → sending) and queues one delivery per active subscriber.
 * Returns the number queued, or null if the post was not a draft any more.
 */
export async function queuePost(postId: string, publicationId: string): Promise<number | null> {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .update(posts)
      .set({ status: "sending", publishedAt: new Date() })
      .where(
        and(
          eq(posts.id, postId),
          eq(posts.publicationId, publicationId),
          eq(posts.status, "draft"),
        ),
      )
      .returning({ id: posts.id });
    if (!locked) return null;

    const queued = await tx.execute<{ id: string }>(sql`
      insert into ${deliveries} (post_id, subscriber_id)
      select ${postId}, id from ${subscribers}
      where publication_id = ${publicationId} and status = 'active'
      on conflict do nothing
      returning id
    `);

    return queued.length;
  });
}

/**
 * Sends every queued delivery for a post, in batches. Safe to call more than once
 * at the same time (rows are claimed with SKIP LOCKED) and safe to call again
 * after a crash (stale claims are put back in the queue).
 */
export async function processDeliveries(postId: string): Promise<void> {
  const [row] = await db
    .select({ post: posts, publication: publications })
    .from(posts)
    .innerJoin(publications, eq(posts.publicationId, publications.id))
    .where(eq(posts.id, postId));
  if (!row || row.post.status !== "sending") return;
  const { post, publication } = row;

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
    // The post now appears in the public archive.
    revalidateTag(publicationTag(publication.slug), { expire: 0 });
  }
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
