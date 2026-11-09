import { parseMarkdown } from "@/lib/markdown/parse";

/**
 * The free part of a paid post: its first few blocks (paragraphs, headings,
 * images…), at most a third of the post and at most three blocks.
 */
export function previewMarkdown(content: string): { preview: string; truncated: boolean } {
  const root = parseMarkdown(content);
  const blocks = root.children;
  const keep = Math.max(1, Math.min(3, Math.floor(blocks.length / 3)));
  if (blocks.length <= keep) return { preview: content, truncated: false };
  const end = blocks[keep - 1].position?.end.offset;
  if (end === undefined) return { preview: content, truncated: false };
  return { preview: content.slice(0, end).trimEnd(), truncated: true };
}

/** The preview plus an "upgrade" button, for free readers' emails. */
export function paywalledMarkdown(content: string, upgradeUrl: string, publicationName: string) {
  const { preview } = previewMarkdown(content);
  return `${preview}\n\n---\n\n**The rest of this post is for paid subscribers of ${publicationName}.**\n\n[Upgrade to read the rest](${upgradeUrl})\n`;
}
