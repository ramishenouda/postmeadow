import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { publications, subscribers, subscriberTags, tags } from "@/db/schema";
import { publicTopics } from "@/lib/topics";
import { enrollOnTags } from "@/lib/automations";

/**
 * A reader's own settings, reached through the link in every email's footer (the
 * unsubscribe token): pause emails for a while, choose topics, or unsubscribe.
 */

export const PAUSE_MONTHS = [1, 2, 3] as const;

export async function findPreferences(token: string) {
  const [row] = await db
    .select({
      id: subscribers.id,
      email: subscribers.email,
      status: subscribers.status,
      pausedUntil: subscribers.pausedUntil,
      paidStatus: subscribers.paidStatus,
      paidUntil: subscribers.paidUntil,
      stripeCustomerId: subscribers.stripeCustomerId,
      publicationId: publications.id,
      publicationName: publications.name,
      publicationSlug: publications.slug,
      accentColor: publications.accentColor,
      referralsEnabled: publications.referralsEnabled,
    })
    .from(subscribers)
    .innerJoin(publications, eq(subscribers.publicationId, publications.id))
    .where(eq(subscribers.unsubscribeToken, token))
    .limit(1);
  if (!row) return null;
  const [topics, mine] = await Promise.all([
    publicTopics(row.publicationId),
    db
      .select({ id: subscriberTags.tagId })
      .from(subscriberTags)
      .where(eq(subscriberTags.subscriberId, row.id)),
  ]);
  const chosen = new Set(mine.map((t) => t.id));
  return {
    ...row,
    paused: Boolean(row.pausedUntil && row.pausedUntil > new Date()),
    topics: topics.map((t) => ({ ...t, chosen: chosen.has(t.id) })),
  };
}

/** Pause for whole months from now; returns the date emails start again. */
export async function pauseByToken(token: string, months: number): Promise<Date | null> {
  if (!(PAUSE_MONTHS as readonly number[]).includes(months)) return null;
  const [row] = await db
    .update(subscribers)
    .set({ pausedUntil: sql`now() + make_interval(months => ${months})` })
    .where(and(eq(subscribers.unsubscribeToken, token), eq(subscribers.status, "active")))
    .returning({ pausedUntil: subscribers.pausedUntil });
  return row?.pausedUntil ?? null;
}

export async function resumeByToken(token: string) {
  await db
    .update(subscribers)
    .set({ pausedUntil: null })
    .where(eq(subscribers.unsubscribeToken, token));
}

/**
 * Sets which of the publication's public topics the reader follows. Tags the writer
 * keeps private are never touched.
 */
export async function setTopicsByToken(token: string, tagIds: string[]) {
  const [subscriber] = await db
    .select({ id: subscribers.id, publicationId: subscribers.publicationId })
    .from(subscribers)
    .where(eq(subscribers.unsubscribeToken, token));
  if (!subscriber) return false;
  const topics = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.publicationId, subscriber.publicationId), eq(tags.public, true)))
    .orderBy(asc(tags.name));
  const allowed = new Set(topics.map((t) => t.id));
  const wanted = tagIds.filter((id) => allowed.has(id));
  await db.transaction(async (tx) => {
    if (allowed.size) {
      await tx
        .delete(subscriberTags)
        .where(
          and(
            eq(subscriberTags.subscriberId, subscriber.id),
            inArray(subscriberTags.tagId, [...allowed]),
          ),
        );
    }
    if (wanted.length) {
      await tx
        .insert(subscriberTags)
        .values(wanted.map((tagId) => ({ subscriberId: subscriber.id, tagId })))
        .onConflictDoNothing();
    }
  });
  await enrollOnTags([subscriber.id], wanted);
  return true;
}
