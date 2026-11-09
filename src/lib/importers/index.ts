import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { htmlToMarkdown, slugFrom } from "./html-to-markdown";
import type { ImportedPost } from "./types";

export { ImportError } from "./types";
export { readSubstackExport } from "./substack";
export { readGhostExport } from "./ghost";
export { fetchFeed, readFeed } from "./feed";

export const MAX_IMPORT_POSTS = 2000;

export type ImportMode = "archive" | "drafts";
export type ImportSummary = { imported: number; skipped: number; drafts: number; hidden: number };

/**
 * Saves imported posts. "archive": published ones go straight into the web archive
 * as sent posts (no emails go out), keeping their dates; members-only and paid posts
 * are kept off the web. "drafts": everything becomes a draft. Posts imported before
 * (same source id) are skipped.
 */
export async function savePosts(
  publicationId: string,
  authorId: string,
  items: ImportedPost[],
  mode: ImportMode,
): Promise<ImportSummary> {
  const summary: ImportSummary = { imported: 0, skipped: 0, drafts: 0, hidden: 0 };
  const batch = items.slice(0, MAX_IMPORT_POSTS);
  summary.skipped += items.length - batch.length;

  const keys = batch.map((p) => p.key.slice(0, 300));
  const known = new Set<string>();
  for (let i = 0; i < keys.length; i += 500) {
    const rows = await db
      .select({ key: posts.importKey })
      .from(posts)
      .where(
        and(
          eq(posts.publicationId, publicationId),
          inArray(posts.importKey, keys.slice(i, i + 500)),
        ),
      );
    for (const r of rows) if (r.key) known.add(r.key);
  }
  const taken = new Set(
    (
      await db
        .select({ slug: posts.slug })
        .from(posts)
        .where(eq(posts.publicationId, publicationId))
    ).map((r) => r.slug),
  );
  const uniqueSlug = (wanted: string) => {
    const base = slugFrom(wanted);
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base.slice(0, 36)}-${n}`;
    taken.add(slug);
    return slug;
  };

  // Oldest first, so the archive order matches the dates.
  const ordered = [...batch].sort(
    (a, b) => (a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0),
  );
  for (const item of ordered) {
    const key = item.key.slice(0, 300);
    if (known.has(key)) {
      summary.skipped++;
      continue;
    }
    let content = htmlToMarkdown(item.html, { base: item.base });
    if (item.coverImage && !content.includes(item.coverImage)) {
      content = `![](${item.coverImage})\n\n${content}`;
    }
    if (!content.trim()) {
      summary.skipped++;
      continue;
    }
    const validDate =
      item.publishedAt && !Number.isNaN(item.publishedAt.getTime()) ? item.publishedAt : null;
    const toArchive = mode === "archive" && item.published;
    await db.insert(posts).values({
      publicationId,
      authorId,
      importKey: key,
      title: item.title.slice(0, 200),
      subtitle: item.subtitle?.slice(0, 300) || null,
      slug: uniqueSlug(item.slug || item.title),
      content: content.slice(0, 200_000),
      status: toArchive ? "sent" : "draft",
      publishedAt: toArchive ? (validDate ?? new Date()) : null,
      webHidden: toArchive && !item.public,
    });
    known.add(key);
    summary.imported++;
    if (!toArchive) summary.drafts++;
    else if (!item.public) summary.hidden++;
  }
  return summary;
}
