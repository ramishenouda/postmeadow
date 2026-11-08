import { and, desc, eq, max } from "drizzle-orm";
import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { db } from "@/db";
import { posts, publications } from "@/db/schema";
import { absoluteUrl, postUrl, publicationUrl } from "@/lib/urls";

/**
 * Every publication and every post that's published on the web. Generated per
 * request (it reads the database, which isn't available while building).
 * One sitemap holds up to 50,000 URLs; split with generateSitemaps() when we get there.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const visible = and(eq(posts.status, "sent"), eq(posts.webHidden, false));

  const [pubs, sentPosts] = await Promise.all([
    db
      .select({ slug: publications.slug, lastPost: max(posts.publishedAt) })
      .from(publications)
      .leftJoin(posts, and(eq(posts.publicationId, publications.id), visible))
      .groupBy(publications.slug),
    db
      .select({ pub: publications.slug, slug: posts.slug, at: posts.updatedAt })
      .from(posts)
      .innerJoin(publications, eq(posts.publicationId, publications.id))
      .where(visible)
      .orderBy(desc(posts.publishedAt))
      .limit(49_000),
  ]);

  return [
    { url: absoluteUrl("/"), changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/pricing"), changeFrequency: "monthly", priority: 0.8 },
    ...pubs.map((p) => ({
      url: publicationUrl(p.slug),
      lastModified: p.lastPost ?? undefined,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...sentPosts.map((p) => ({
      url: postUrl(p.pub, p.slug),
      lastModified: p.at,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
