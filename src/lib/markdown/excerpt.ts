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
