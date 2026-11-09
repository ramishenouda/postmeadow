import { render } from "@react-email/render";
import { createElement, Fragment } from "react";
import { webComponents } from "@/components/markdown-components";
import { markdownExcerpt } from "@/lib/markdown/excerpt";
import { parseMarkdown } from "@/lib/markdown/parse";
import { renderMarkdownTree } from "@/lib/markdown/render";
import { getFeedPosts, getPublicPublication } from "@/lib/public-data";
import { absoluteUrl, postUrl, publicationUrl } from "@/lib/urls";
import { liveDomain } from "@/lib/domains";
import { previewMarkdown } from "@/lib/paid-preview";

const escapeXml = (s: string) =>
  s.replace(
    /[<>&'"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!,
  );

/** CDATA can't contain "]]>", so split it across two sections. */
const cdata = (s: string) => `<![CDATA[${s.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;

/** RSS 2.0 feed of a publication's sent posts, with full content. */
export async function GET(_request: Request, { params }: RouteContext<"/[slug]/feed.xml">) {
  const { slug } = await params;
  const publication = await getPublicPublication(slug);
  if (!publication) return new Response("Not found", { status: 404 });
  const posts = await getFeedPosts(slug);

  const items = await Promise.all(
    posts.map(async (post) => {
      // Paid posts: only the free beginning goes in the feed.
      const tree = parseMarkdown(
        post.paid
          ? `${previewMarkdown(post.content).preview}\n\n*The rest is for paid subscribers.*`
          : post.content,
      );
      // Next.js doesn't allow react-dom/server in app routes; React Email's renderer is fine.
      // It adds an email doctype and React's <!--$--> boundary markers, which a feed doesn't want.
      const html = (
        await render(createElement(Fragment, null, renderMarkdownTree(tree, webComponents)))
      )
        .replace(/^<!DOCTYPE[^>]*>/i, "")
        .replace(/<!--\/?\$-->/g, "");
      const url = postUrl(slug, post.slug, liveDomain(publication));
      return [
        "<item>",
        `<title>${escapeXml(post.title)}</title>`,
        `<link>${escapeXml(url)}</link>`,
        `<guid isPermaLink="true">${escapeXml(url)}</guid>`,
        post.publishedAt ? `<pubDate>${post.publishedAt.toUTCString()}</pubDate>` : "",
        `<description>${escapeXml(post.subtitle || markdownExcerpt(tree, 280))}</description>`,
        `<content:encoded>${cdata(html)}</content:encoded>`,
        "</item>",
      ].join("");
    }),
  );

  const home = publicationUrl(slug, liveDomain(publication));
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    `<title>${escapeXml(publication.name)}</title>`,
    `<link>${escapeXml(home)}</link>`,
    `<description>${escapeXml(publication.description || publication.name)}</description>`,
    "<language>en</language>",
    `<atom:link href="${escapeXml(absoluteUrl(`/${slug}/feed.xml`))}" rel="self" type="application/rss+xml"/>`,
    posts[0]?.publishedAt
      ? `<lastBuildDate>${posts[0].publishedAt.toUTCString()}</lastBuildDate>`
      : "",
    publication.logoUrl
      ? `<image><url>${escapeXml(publication.logoUrl)}</url><title>${escapeXml(publication.name)}</title><link>${escapeXml(home)}</link></image>`
      : "",
    ...items,
    "</channel>",
    "</rss>",
  ].join("\n");

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
