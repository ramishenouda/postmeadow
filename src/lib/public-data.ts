import "server-only";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { landingPages, posts, publications, subscribers, tags, user } from "@/db/schema";
import { publicationTag } from "@/lib/cache-tags";
import { firstImage, markdownExcerpt, readingMinutes } from "@/lib/markdown/excerpt";
import { parseMarkdown } from "@/lib/markdown/parse";
import { previewMarkdown } from "@/lib/paid-preview";

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
      popupHeadline: publications.popupHeadline,
      popupDelaySeconds: publications.popupDelaySeconds,
      customDomain: publications.customDomain,
      customDomainVerifiedAt: publications.customDomainVerifiedAt,
      paidEnabled: publications.paidEnabled,
      paidCurrency: publications.paidCurrency,
      paidMonthlyCents: publications.paidMonthlyCents,
      paidYearlyCents: publications.paidYearlyCents,
      paidDescription: publications.paidDescription,
      acceptsPayments: sql<boolean>`(${publications.paidEnabled} and ${publications.stripeChargesEnabled}
        and ${publications.stripeAccountId} is not null
        and (${publications.paidMonthlyPriceId} is not null or ${publications.paidYearlyPriceId} is not null))`,
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
      paid: posts.paid,
    })
    .from(posts)
    .innerJoin(publications, eq(posts.publicationId, publications.id))
    .where(and(eq(publications.slug, slug), eq(posts.status, "sent"), eq(posts.webHidden, false)))
    .orderBy(desc(posts.publishedAt));
  return rows.map(({ content, ...post }) => {
    // Paid posts: excerpts and thumbnails come from the free beginning only.
    const full = parseMarkdown(content);
    const root = post.paid ? parseMarkdown(previewMarkdown(content).preview) : full;
    return {
      ...post,
      excerpt: post.subtitle ? "" : markdownExcerpt(root, 180),
      image: firstImage(root),
      minutes: readingMinutes(full),
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
      paid: posts.paid,
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
      sponsor: posts.sponsor,
      author: user.name,
      paid: posts.paid,
    })
    .from(posts)
    .innerJoin(publications, eq(posts.publicationId, publications.id))
    .leftJoin(user, eq(user.id, posts.authorId))
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

/** A campaign landing page (/{slug}/l/{page}) with the tag its sign-ups get. */
export async function getLandingPage(slug: string, page: string) {
  "use cache";
  cacheTag(publicationTag(slug));
  cacheLife("minutes");
  const [row] = await db
    .select({
      headline: landingPages.headline,
      body: landingPages.body,
      buttonText: landingPages.buttonText,
      tag: tags.name,
    })
    .from(landingPages)
    .innerJoin(publications, eq(publications.id, landingPages.publicationId))
    .leftJoin(tags, eq(tags.id, landingPages.tagId))
    .where(and(eq(publications.slug, slug), eq(landingPages.slug, page)))
    .limit(1);
  return row ?? null;
}
