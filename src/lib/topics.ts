import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { publications, tags } from "@/db/schema";
import { publicationTag } from "@/lib/cache-tags";

/** Tags the writer made public: topics readers can pick when subscribing or later. */
export async function publicTopics(publicationId: string) {
  return db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(and(eq(tags.publicationId, publicationId), eq(tags.public, true)))
    .orderBy(asc(sql`lower(${tags.name})`));
}

/** Public topics for the sign-up form on a publication's page (cached with the page). */
export async function getPublicTopics(slug: string) {
  "use cache";
  cacheTag(publicationTag(slug));
  cacheLife("minutes");
  return db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .innerJoin(publications, eq(publications.id, tags.publicationId))
    .where(and(eq(publications.slug, slug), eq(tags.public, true)))
    .orderBy(asc(sql`lower(${tags.name})`));
}
