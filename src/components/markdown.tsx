import { parseMarkdown } from "@/lib/markdown/parse";
import { renderMarkdownTree } from "@/lib/markdown/render";
import { webComponents } from "./markdown-components";
import { cn } from "@/lib/utils";

export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("prose prose-stone max-w-none", className)}>
      {renderMarkdownTree(parseMarkdown(content), webComponents)}
    </div>
  );
}
