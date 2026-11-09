import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { XMLParser } from "fast-xml-parser";
import { ImportError, type ImportedPost } from "./types";

/**
 * RSS or Atom: beehiiv, Substack (/feed), Ghost (/rss), WordPress, Medium and most
 * blogs. Feeds usually hold the latest posts only (often 20–50).
 */

const MAX_FEED_BYTES = 20 * 1024 * 1024;

/** Refuse addresses on this machine or a private network (the server fetches them). */
function privateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return privateAddress(v.slice(7));
    return (
      v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")
    );
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

export async function fetchFeed(address: string, { allowPrivate = false } = {}): Promise<string> {
  let url: URL;
  try {
    url = new URL(address.trim());
  } catch {
    throw new ImportError("Enter the feed's full address, starting with https://");
  }
  if (!/^https?:$/.test(url.protocol)) throw new ImportError("Use an http(s) address.");
  for (let hop = 0; hop < 4; hop++) {
    if (!allowPrivate) {
      const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
      if (addresses.length === 0) throw new ImportError(`Couldn't find ${url.hostname}.`);
      if (addresses.some((a) => privateAddress(a.address))) {
        throw new ImportError("That address isn't on the public internet.");
      }
    }
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "user-agent": "Postmeadow feed importer",
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    if (!res.ok) throw new ImportError(`The feed answered with an error (${res.status}).`);
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_FEED_BYTES) throw new ImportError("That feed is too large.");
    const text = await res.text();
    if (text.length > MAX_FEED_BYTES) throw new ImportError("That feed is too large.");
    return text;
  }
  throw new ImportError("Too many redirects.");
}

const text = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object" && "#text" in (v as object))
    return String((v as { "#text": unknown })["#text"]);
  return "";
};
const list = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

function lastPathPart(link: string): string {
  try {
    return new URL(link).pathname.split("/").filter(Boolean).pop() ?? "";
  } catch {
    return "";
  }
}

export function readFeed(xml: string): ImportedPost[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    processEntities: true,
    htmlEntities: true,
  });
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml);
  } catch {
    throw new ImportError("That isn't an RSS or Atom feed.");
  }
  const rss = (doc.rss as { channel?: { item?: unknown; link?: unknown } } | undefined)?.channel;
  if (rss) {
    const base = text(rss.link) || undefined;
    return list(rss.item as Record<string, unknown>[]).map((item) => {
      const link = text(item.link);
      const guid = text(item.guid) || link || text(item.title);
      const html = text(item["content:encoded"]) || text(item.description);
      const date = text(item.pubDate) || text(item["dc:date"]);
      return {
        key: `feed:${guid}`,
        title: text(item.title).trim() || "Untitled",
        subtitle: item["content:encoded"]
          ? text(item.description)
              .replace(/<[^>]+>/g, "")
              .trim()
              .slice(0, 300) || null
          : null,
        slug: lastPathPart(link) || text(item.title),
        html,
        publishedAt: date ? new Date(date) : null,
        published: true,
        public: true,
        base: link || base,
      };
    });
  }
  const feed = doc.feed as { entry?: unknown } | undefined;
  if (feed) {
    return list(feed.entry as Record<string, unknown>[]).map((entry) => {
      const links = list(entry.link as Record<string, string>[]);
      const link = links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate")?.["@_href"] ?? "";
      const date = text(entry.published) || text(entry.updated);
      return {
        key: `feed:${text(entry.id) || link}`,
        title: text(entry.title).trim() || "Untitled",
        subtitle:
          text(entry.summary)
            .replace(/<[^>]+>/g, "")
            .trim()
            .slice(0, 300) || null,
        slug: lastPathPart(link) || text(entry.title),
        html: text(entry.content) || text(entry.summary),
        publishedAt: date ? new Date(date) : null,
        published: true,
        public: true,
        base: link || undefined,
      };
    });
  }
  throw new ImportError("That isn't an RSS or Atom feed.");
}
