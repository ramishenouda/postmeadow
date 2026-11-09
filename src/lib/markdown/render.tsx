import type {
  Definition,
  Image,
  Link,
  Nodes,
  Paragraph,
  Root,
  RootContent,
  TableCell,
} from "mdast";
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
  /** A paragraph that is just one link: shown as a button. */
  button: (p: WithChildren & { href: string }) => ReactNode;
  /** Images on their own: one per row alone, or side by side (2 or 3 per row). */
  gallery: (p: { rows: GalleryImage[][] }) => ReactNode;
};

/** `title` is the caption ("Linen shirt · $59"), shown under the image. */
export type GalleryImage = { src: string; alt: string; title: string | null };

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

const isBlank = (n: Nodes) => (n.type === "text" && !n.value.trim()) || n.type === "break";

/** The images of a paragraph made only of images (ignoring spaces), else null. */
export function imageOnlyParagraph(node: RootContent): Image[] | null {
  if (node.type !== "paragraph") return null;
  const content = node.children.filter((c) => !isBlank(c));
  if (content.length === 0 || !content.every((c) => c.type === "image")) return null;
  return content as Image[];
}

/** The link of a paragraph that is just one link (a button), else null. */
export function buttonParagraph(node: RootContent): Link | null {
  if (node.type !== "paragraph") return null;
  const content = (node as Paragraph).children.filter((c) => !isBlank(c));
  const [only] = content;
  return content.length === 1 && only.type === "link" && safeLinkUrl(only.url) ? only : null;
}

/** Splits n images into rows of 3, with 2s where a row of 1 would be left over. */
export function galleryRows<T>(images: T[]): T[][] {
  const rows: T[][] = [];
  let rest = images;
  while (rest.length > 0) {
    const take = rest.length === 4 || rest.length === 2 ? 2 : 3;
    rows.push(rest.slice(0, take));
    rest = rest.slice(take);
  }
  return rows;
}

/**
 * A post that opens with a single image: that image, and the rest of the post.
 * Designs with a hero area show it above the title.
 */
export function splitHero(root: Root): { hero: GalleryImage | null; rest: Root } {
  const [first, second] = root.children;
  const images = first ? imageOnlyParagraph(first) : null;
  const nextIsImage = second ? imageOnlyParagraph(second) !== null : false;
  if (!images || images.length !== 1 || nextIsImage) return { hero: null, rest: root };
  const src = safeImageUrl(images[0].url);
  if (!src) return { hero: null, rest: root };
  return {
    hero: { src, alt: images[0].alt ?? "", title: images[0].title ?? null },
    rest: { ...root, children: root.children.slice(1) },
  };
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

  /**
   * Top-level blocks, with runs of image-only paragraphs gathered into galleries.
   * (The editor stores side-by-side images as consecutive image paragraphs.)
   */
  function renderBlocks(nodes: RootContent[]): ReactNode[] {
    const out: ReactNode[] = [];
    for (let i = 0; i < nodes.length;) {
      const run: GalleryImage[] = [];
      let j = i;
      for (let images; j < nodes.length && (images = imageOnlyParagraph(nodes[j])); j++) {
        for (const image of images) {
          const src = safeImageUrl(image.url);
          if (src) run.push({ src, alt: image.alt ?? "", title: image.title ?? null });
        }
      }
      // A lone image goes through the gallery too (a row of one), so it gets its caption.
      if (run.length >= 1) {
        out.push(<Fragment key={i}>{c.gallery({ rows: galleryRows(run) })}</Fragment>);
        i = j;
      } else {
        out.push(<Fragment key={i}>{renderNode(nodes[i])}</Fragment>);
        i += 1;
      }
    }
    return out;
  }

  function renderNode(node: Nodes): ReactNode {
    switch (node.type) {
      case "root":
        return renderBlocks(node.children);
      case "paragraph": {
        const link = buttonParagraph(node);
        if (link) {
          return c.button({
            href: safeLinkUrl(link.url)!,
            children: renderChildren(link.children),
          });
        }
        return c.paragraph({ children: renderChildren(node.children) });
      }
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
