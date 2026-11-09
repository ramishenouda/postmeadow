import { ImportError, type ImportedPost } from "./types";

/**
 * Ghost's export (Settings → Advanced → Import/Export → Export your content) is JSON.
 * Its links and images use __GHOST_URL__ for the site's address, so we need it.
 */

type GhostPost = {
  id?: string;
  uuid?: string;
  title?: string;
  slug?: string;
  html?: string | null;
  custom_excerpt?: string | null;
  feature_image?: string | null;
  status?: string;
  type?: string;
  visibility?: string;
  published_at?: string | null;
};

export function readGhostExport(json: string, siteUrl: string | null): ImportedPost[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ImportError("That isn't a Ghost export (it should be a .json file).");
  }
  const root = parsed as {
    db?: { data?: { posts?: GhostPost[] } }[];
    data?: { posts?: GhostPost[] };
  };
  const list = root.db?.[0]?.data?.posts ?? root.data?.posts;
  if (!Array.isArray(list))
    throw new ImportError("No posts found. Is this a Ghost content export?");
  const site = siteUrl?.replace(/\/+$/, "") ?? "";
  const fix = (s: string) => (site ? s.replaceAll("__GHOST_URL__", site) : s);

  return list
    .filter((p) => (p.type ?? "post") === "post" && p.html)
    .map((p) => ({
      key: `ghost:${p.uuid ?? p.id ?? p.slug}`,
      title: p.title?.trim() || "Untitled",
      subtitle: p.custom_excerpt?.trim() || null,
      slug: p.slug ?? p.title ?? "post",
      html: fix(p.html ?? ""),
      publishedAt: p.published_at ? new Date(p.published_at) : null,
      published: p.status === "published",
      public: !p.visibility || p.visibility === "public",
      base: site || undefined,
      coverImage: p.feature_image ? fix(p.feature_image) : null,
    }));
}
