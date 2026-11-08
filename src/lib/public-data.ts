import "server-only";
import { and, count, desc, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { posts, publications, subscribers } from "@/db/schema";
import { publicationTag } from "@/lib/cache-tags";
import { firstImage, markdownExcerpt, readingMinutes } from "@/lib/markdown/excerpt";
import { parseMarkdown } from "@/lib/markdown/parse";

/**
 * Cached reads for public pages. Invalidate with publicationTag(slug) whenever a
 * post is sent or the publication's settings change.
 *
 * The lifetime is deliberately short ("minutes"): tags make changes show up
 * immediately, and the short lifetime bounds how long a page can stay stale if
 * an invalidation is ever missed (seen once in testing, not reproducible).
 *
 * "On the web" means sent and not hidden by the writer (posts.webHidden).
 */

export async function getPublicPublication(slug: string) {
  "use cache";
  cacheTag(publicationTag(slug));
  cacheLife("minutes");
  const [publication] = await db
    .select({
      id: publications.id,
      name: publications.name,
      slug: publications.slug,
      description: publications.description,
      logoUrl: publications.logoUrl,
      accentColor: publications.accentColor,
      fontStyle: publications.fontStyle,
    })
    .from(publications)
    .where(eq(publications.slug, slug))
    .limit(1);
  return publication ?? null;
}

/**
 * The archive: every post on the web, newest first, with a short excerpt, the first
 * image (as a thumbnail) and reading time. Content is parsed here, inside the cache,
 * so the page never ships whole posts.
 */
export async function getPublishedPosts(slug: string) {
  "use cache";
  cacheTag(publicationTag(slug));
  cacheLife("minutes");
  const rows = await db
    .select({
      title: posts.title,
      subtitle: posts.subtitle,
      slug: posts.slug,
      content: posts.content,
      publishedAt: posts.publishedAt,
    })
    .from(posts)
    .innerJoin(publications, eq(posts.publicationId, publications.id))
    .where(and(eq(publications.slug, slug), eq(posts.status, "sent"), eq(posts.webHidden, false)))
    .orderBy(desc(posts.publishedAt));
  return rows.map(({ content, ...post }) => {
    const root = parseMarkdown(content);
    return {
      ...post,
      excerpt: post.subtitle ? "" : markdownExcerpt(root, 180),
      image: firstImage(root),
      minutes: readingMinutes(root),
    };
  });
}

/**
 * Active subscribers, for "Join N readers". Not invalidated on every signup: the
 * short cache lifetime is fresh enough for a social-proof number.
 */
export async function getReaderCount(publicationId: string) {
  "use cache";
  cacheLife("minutes");
  const [row] = await db
    .select({ n: count() })
    .from(subscribers)
    .where(and(eq(subscribers.publicationId, publicationId), eq(subscribers.status, "active")));
  return row?.n ?? 0;
}

/** The latest sent posts with their content, for the RSS feed. */
export async function getFeedPosts(slug: string, limit = 20) {
  "use cache";
  cacheTag(publicationTag(slug));
  cacheLife("minutes");
  return db
    .select({
      title: posts.title,
      subtitle: posts.subtitle,
      slug: posts.slug,
      content: posts.content,
      publishedAt: posts.publishedAt,
    })
    .from(posts)
    .innerJoin(publications, eq(posts.publicationId, publications.id))
    .where(and(eq(publications.slug, slug), eq(posts.status, "sent"), eq(posts.webHidden, false)))
    .orderBy(desc(posts.publishedAt))
    .limit(limit);
}

export async function getPublishedPost(slug: string, postSlug: string) {
  "use cache";
  cacheTag(publicationTag(slug));
  cacheLife("minutes");
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
    .where(
      and(
        eq(publications.slug, slug),
        eq(posts.slug, postSlug),
        eq(posts.status, "sent"),
        eq(posts.webHidden, false),
      ),
    )
    .limit(1);
  return post ?? null;
}
