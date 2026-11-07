import type { Definition, Nodes, Root, TableCell } from "mdast";
import { Fragment, type ReactNode } from "react";

/**
 * Renders a Markdown syntax tree with a caller-supplied set of components.
 * The email renderer and the web archive use the same tree and the same
 * rules (which URLs are allowed, what raw HTML does), only the components differ.
 */

type WithChildren = { children: ReactNode };

export type MarkdownComponents = {
  paragraph: (p: WithChildren) => ReactNode;
  heading: (p: WithChildren & { level: 1 | 2 | 3 | 4 | 5 | 6 }) => ReactNode;
  blockquote: (p: WithChildren) => ReactNode;
  list: (p: WithChildren & { ordered: boolean; start: number }) => ReactNode;
  listItem: (p: WithChildren & { checked: boolean | null }) => ReactNode;
  code: (p: { value: string; lang: string | null }) => ReactNode;
  inlineCode: (p: { value: string }) => ReactNode;
  thematicBreak: () => ReactNode;
  link: (p: WithChildren & { href: string }) => ReactNode;
  image: (p: { src: string; alt: string; title: string | null }) => ReactNode;
  emphasis: (p: WithChildren) => ReactNode;
  strong: (p: WithChildren) => ReactNode;
  strikethrough: (p: WithChildren) => ReactNode;
  lineBreak: () => ReactNode;
  table: (p: { head: ReactNode[][]; rows: ReactNode[][]; align: TableAlign[] }) => ReactNode;
};

export type TableAlign = "left" | "right" | "center" | null;

const SAFE_LINK = /^(https?:|mailto:)/i;
const SAFE_IMAGE = /^https?:/i;

export function safeLinkUrl(url: string): string | null {
  const trimmed = url.trim();
  return SAFE_LINK.test(trimmed) ? trimmed : null;
}

export function safeImageUrl(url: string): string | null {
  const trimmed = url.trim();
  return SAFE_IMAGE.test(trimmed) ? trimmed : null;
}

export function renderMarkdownTree(root: Root, components: MarkdownComponents): ReactNode {
  const definitions = new Map<string, Definition>();
  for (const node of root.children) {
    if (node.type === "definition") definitions.set(node.identifier.toLowerCase(), node);
  }

  const c = components;

  const renderChildren = (nodes: Nodes[]): ReactNode[] =>
    nodes.map((child, i) => <Fragment key={i}>{renderNode(child)}</Fragment>);

  function renderLink(url: string, children: ReactNode): ReactNode {
    const href = safeLinkUrl(url);
    return href ? c.link({ href, children }) : children;
  }

  function renderImage(url: string, alt: string, title: string | null): ReactNode {
    const src = safeImageUrl(url);
    return src ? c.image({ src, alt, title }) : null;
  }

  function renderNode(node: Nodes): ReactNode {
    switch (node.type) {
      case "root":
        return renderChildren(node.children);
      case "paragraph":
        return c.paragraph({ children: renderChildren(node.children) });
      case "heading":
        return c.heading({ level: node.depth, children: renderChildren(node.children) });
      case "blockquote":
        return c.blockquote({ children: renderChildren(node.children) });
      case "list":
        return c.list({
          ordered: Boolean(node.ordered),
          start: node.start ?? 1,
          children: renderChildren(node.children),
        });
      case "listItem": {
        // "Tight" list items wrap their text in a paragraph; unwrap it so items don't get margins.
        const children = node.spread
          ? renderChildren(node.children)
          : node.children.map((child, i) => (
              <Fragment key={i}>
                {child.type === "paragraph" ? renderChildren(child.children) : renderNode(child)}
              </Fragment>
            ));
        return c.listItem({ checked: node.checked ?? null, children });
      }
      case "code":
        return c.code({ value: node.value, lang: node.lang ?? null });
      case "inlineCode":
        return c.inlineCode({ value: node.value });
      case "thematicBreak":
        return c.thematicBreak();
      case "link":
        return renderLink(node.url, renderChildren(node.children));
      case "linkReference": {
        const def = definitions.get(node.identifier.toLowerCase());
        const children = renderChildren(node.children);
        return def ? renderLink(def.url, children) : children;
      }
      case "image":
        return renderImage(node.url, node.alt ?? "", node.title ?? null);
      case "imageReference": {
        const def = definitions.get(node.identifier.toLowerCase());
        return def ? renderImage(def.url, node.alt ?? "", def.title ?? null) : null;
      }
      case "emphasis":
        return c.emphasis({ children: renderChildren(node.children) });
      case "strong":
        return c.strong({ children: renderChildren(node.children) });
      case "delete":
        return c.strikethrough({ children: renderChildren(node.children) });
      case "break":
        return c.lineBreak();
      case "text":
        return node.value;
      case "table": {
        const [headRow, ...bodyRows] = node.children;
        const cells = (cellNodes: TableCell[]) =>
          cellNodes.map((cell) => renderChildren(cell.children));
        return c.table({
          head: headRow ? [cells(headRow.children)] : [],
          rows: bodyRows.map((row) => cells(row.children)),
          align: (node.align ?? []).map((a) => a ?? null),
        });
      }
      // Raw HTML is not rendered: it is unsafe on the web and unreliable in email.
      case "html":
      // Definitions are resolved through references above.
      case "definition":
      case "footnoteDefinition":
        return null;
      case "footnoteReference":
        return `[${node.label ?? node.identifier}]`;
      default:
        return null;
    }
  }

  return renderNode(root);
}
