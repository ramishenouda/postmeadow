import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { publications, recommendations, subscribers } from "@/db/schema";
import { randomToken } from "@/lib/tokens";

/**
 * Writers recommend other publications on Postmeadow. New readers see them right
 * after confirming and can subscribe in one click: their address was just confirmed,
 * so the new subscriptions are active straight away (source "recommendation").
 */

export const MAX_RECOMMENDATIONS = 12;

export async function listRecommendations(publicationId: string) {
  return db
    .select({
      id: publications.id,
      name: publications.name,
      slug: publications.slug,
      description: publications.description,
      logoUrl: publications.logoUrl,
      accentColor: publications.accentColor,
      note: recommendations.note,
    })
    .from(recommendations)
    .innerJoin(publications, eq(publications.id, recommendations.recommendedId))
    .where(eq(recommendations.publicationId, publicationId))
    .orderBy(asc(recommendations.createdAt));
}

/** Publications that recommend this one. */
export async function recommendedBy(publicationId: string) {
  return db
    .select({ name: publications.name, slug: publications.slug })
    .from(recommendations)
    .innerJoin(publications, eq(publications.id, recommendations.publicationId))
    .where(eq(recommendations.recommendedId, publicationId))
    .orderBy(asc(publications.name));
}

/**
 * Subscribes an address that was just confirmed for `fromPublicationId` to some of
 * that publication's recommendations. Returns the ids of new active subscribers
 * (for welcome emails).
 */
export async function subscribeToRecommended(
  fromPublicationId: string,
  email: string,
  publicationIds: string[],
): Promise<string[]> {
  if (publicationIds.length === 0) return [];
  const allowed = await db
    .select({ id: recommendations.recommendedId })
    .from(recommendations)
    .where(
      and(
        eq(recommendations.publicationId, fromPublicationId),
        inArray(recommendations.recommendedId, publicationIds.slice(0, MAX_RECOMMENDATIONS)),
      ),
    );
  const added: string[] = [];
  for (const { id } of allowed) {
    const [existing] = await db
      .select({ id: subscribers.id, status: subscribers.status })
      .from(subscribers)
      .where(and(eq(subscribers.publicationId, id), eq(subscribers.email, email)));
    if (existing?.status === "active" || existing?.status === "bounced") continue;
    const now = new Date();
    if (existing) {
      // They choose it now, so an old unsubscribe or declined invitation doesn't stand.
      await db
        .update(subscribers)
        .set({
          status: "active",
          confirmedAt: now,
          confirmToken: null,
          statusReason: null,
          source: "recommendation",
        })
        .where(eq(subscribers.id, existing.id));
      added.push(existing.id);
    } else {
      const [row] = await db
        .insert(subscribers)
        .values({
          publicationId: id,
          email,
          status: "active",
          confirmedAt: now,
          unsubscribeToken: randomToken(),
          source: "recommendation",
        })
        .onConflictDoNothing()
        .returning({ id: subscribers.id });
      if (row) added.push(row.id);
    }
  }
  return added;
}
