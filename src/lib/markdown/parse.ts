import type { Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

// GFM adds tables, strikethrough, task lists and bare-URL autolinks.
const processor = unified().use(remarkParse).use(remarkGfm);

export function parseMarkdown(markdown: string): Root {
  return processor.parse(markdown);
}
