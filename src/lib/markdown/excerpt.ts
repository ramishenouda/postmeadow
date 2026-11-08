import type { Nodes, Root } from "mdast";

/** Plain text of the first paragraphs, for inbox previews and meta descriptions. */
export function markdownExcerpt(root: Root, maxLength: number): string {
  const parts: string[] = [];
  let length = 0;

  const textOf = (node: Nodes): string => {
    if ("value" in node && (node.type === "text" || node.type === "inlineCode")) return node.value;
    if ("children" in node) return node.children.map((c) => textOf(c as Nodes)).join("");
    return "";
  };

  for (const node of root.children) {
    if (node.type !== "paragraph") continue;
    const text = textOf(node).replace(/\s+/g, " ").trim();
    if (!text) continue;
    parts.push(text);
    length += text.length;
    if (length >= maxLength) break;
  }

  const joined = parts.join(" ");
  return joined.length > maxLength ? `${joined.slice(0, maxLength - 1).trimEnd()}…` : joined;
}

/** The first image in the document, for archive thumbnails. */
export function firstImage(root: Root): { url: string; alt: string } | null {
  const visit = (node: Nodes): { url: string; alt: string } | null => {
    if (node.type === "image") return { url: node.url, alt: node.alt ?? "" };
    if ("children" in node) {
      for (const child of node.children) {
        const found = visit(child as Nodes);
        if (found) return found;
      }
    }
    return null;
  };
  return visit(root);
}

/** Estimated minutes to read, at about 230 words a minute. Never less than 1. */
export function readingMinutes(root: Root): number {
  let words = 0;
  const visit = (node: Nodes) => {
    if ("value" in node && typeof node.value === "string" && node.type !== "html") {
      words += node.value.split(/\s+/).filter(Boolean).length;
    }
    if ("children" in node) for (const child of node.children) visit(child as Nodes);
  };
  visit(root);
  return Math.max(1, Math.round(words / 230));
}
