import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { posts, publications } from "@/db/schema";
import { publicationTag } from "@/lib/cache-tags";

/**
 * Cached reads for public pages. Invalidate with publicationTag(slug) whenever a
 * post is sent or the publication's settings change.
 */

export async function getPublicPublication(slug: string) {
  "use cache";
  cacheTag(publicationTag(slug));
  cacheLife("hours");
  const [publication] = await db
    .select({
      id: publications.id,
      name: publications.name,
      slug: publications.slug,
      description: publications.description,
    })
    .from(publications)
    .where(eq(publications.slug, slug))
    .limit(1);
  return publication ?? null;
}

export async function getPublishedPosts(slug: string) {
  "use cache";
  cacheTag(publicationTag(slug));
  cacheLife("hours");
  return db
    .select({
      title: posts.title,
      subtitle: posts.subtitle,
      slug: posts.slug,
      publishedAt: posts.publishedAt,
    })
    .from(posts)
    .innerJoin(publications, eq(posts.publicationId, publications.id))
    .where(and(eq(publications.slug, slug), eq(posts.status, "sent")))
    .orderBy(desc(posts.publishedAt));
}

export async function getPublishedPost(slug: string, postSlug: string) {
  "use cache";
  cacheTag(publicationTag(slug));
  cacheLife("hours");
  const [post] = await db
    .select({
      title: posts.title,
      subtitle: posts.subtitle,
      slug: posts.slug,
      content: posts.content,
      contentFormat: posts.contentFormat,
      publishedAt: posts.publishedAt,
    })
    .from(posts)
    .innerJoin(publications, eq(posts.publicationId, publications.id))
    .where(and(eq(publications.slug, slug), eq(posts.slug, postSlug), eq(posts.status, "sent")))
    .limit(1);
  return post ?? null;
}
