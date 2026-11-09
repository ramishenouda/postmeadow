import TurndownService from "turndown";
import { strikethrough, tables } from "turndown-plugin-gfm";

/**
 * Imported HTML (Substack, Ghost, feeds) → our Markdown, keeping Postmeadow's
 * conventions: an image on its own line (with its caption as the title), a button as
 * a link alone in its paragraph. Widgets, scripts and forms are dropped.
 */

const JUNK_CLASS =
  /(subscription-widget|subscribe-widget|share-dialog|image-link-expand|post-ufi|footnote-hovercard|kg-signup-card|kg-cta-card|captioned-button-wrap|subscribe-prompt|digest-post-embed)/;

/** A usable image address, or null (data: URIs, tracking pixels, relative junk). */
function imageSrc(node: HTMLElement, base?: string): string | null {
  const raw =
    node.getAttribute("src") ||
    node.getAttribute("data-src") ||
    (node.getAttribute("srcset") ?? "").split(",")[0]?.trim().split(" ")[0] ||
    "";
  if (!raw || raw.startsWith("data:")) return null;
  try {
    const url = new URL(raw, base);
    return /^https?:$/.test(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

const quoteTitle = (s: string) => s.replace(/\s+/g, " ").trim().replace(/"/g, "'");
const escapeAlt = (s: string) => s.replace(/[[\]\n]/g, " ").trim();

function imageLine(img: HTMLElement, caption: string, base?: string): string {
  const src = imageSrc(img, base);
  if (!src) return "";
  const alt = escapeAlt(img.getAttribute("alt") ?? "");
  const title = caption ? ` "${quoteTitle(caption)}"` : "";
  return `\n\n![${alt}](${src}${title})\n\n`;
}

export function htmlToMarkdown(html: string, { base }: { base?: string } = {}): string {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
    hr: "---",
  });
  td.use([tables, strikethrough]);
  td.remove(["script", "style", "form", "button", "noscript", "source", "input", "select"]);
  td.remove((node) => node.nodeName.toLowerCase() === "svg");

  td.addRule("junk", {
    filter: (node) => JUNK_CLASS.test((node as HTMLElement).getAttribute?.("class") ?? ""),
    replacement: () => "",
  });

  // A figure: its images on their own lines, captioned.
  td.addRule("figure", {
    filter: (node) =>
      node.nodeName === "FIGURE" && Boolean((node as HTMLElement).querySelector("img")),
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      const caption = el.querySelector("figcaption")?.textContent ?? "";
      const imgs = Array.from(el.getElementsByTagName("img")) as HTMLElement[];
      return imgs.map((img, i) => imageLine(img, i === 0 ? caption : "", base)).join("");
    },
  });

  // Ghost bookmark cards and similar link previews: just the link.
  td.addRule("bookmark", {
    filter: (node) =>
      node.nodeName === "FIGURE" &&
      /kg-bookmark-card|embedded-post/.test((node as HTMLElement).getAttribute("class") ?? ""),
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      const a = el.querySelector("a");
      const href = a?.getAttribute("href");
      const title =
        el.querySelector(".kg-bookmark-title, .embedded-post-title")?.textContent?.trim() ||
        a?.textContent?.trim() ||
        href;
      return href ? `\n\n[${escapeAlt(title ?? "")}](${href})\n\n` : "";
    },
  });

  td.addRule("image", {
    filter: "img",
    replacement: (_content, node) => {
      const src = imageSrc(node as HTMLElement, base);
      if (!src) return "";
      const width = Number((node as HTMLElement).getAttribute("width") ?? "0");
      if (width > 0 && width <= 2) return ""; // tracking pixel
      return `![${escapeAlt((node as HTMLElement).getAttribute("alt") ?? "")}](${src})`;
    },
  });

  // Buttons become a link alone in a paragraph, which renders as a button here.
  td.addRule("button", {
    filter: (node) =>
      node.nodeName === "A" &&
      /(^|\s)(button|kg-btn|btn)(\s|$|-)/.test((node as HTMLElement).getAttribute("class") ?? ""),
    replacement: (content, node) => {
      const href = (node as HTMLElement).getAttribute("href");
      const text = content.replace(/\s+/g, " ").trim();
      return href && text ? `\n\n[${text}](${href})\n\n` : "";
    },
  });

  // Videos and other embeds: a link to them.
  td.addRule("iframe", {
    filter: "iframe",
    replacement: (_content, node) => {
      const src = (node as HTMLElement).getAttribute("src") ?? "";
      if (!/^https?:\/\//.test(src)) return "";
      const youtube = src.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]+)/);
      const href = youtube ? `https://www.youtube.com/watch?v=${youtube[1]}` : src;
      return `\n\n[Watch it here](${href})\n\n`;
    },
  });

  return td
    .turndown(html)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A post slug from any title or path piece: lowercase, dashes, 3–40 characters. */
export function slugFrom(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug.length >= 3 ? slug : `post-${slug || "x"}`.slice(0, 40);
}
