import { strFromU8, unzipSync } from "fflate";
import Papa from "papaparse";
import { ImportError, type ImportedPost } from "./types";

/**
 * Substack's export (Settings → Exports) is a ZIP with posts.csv and one HTML file per
 * post in posts/. Its email_list CSV can be imported on the Subscribers page.
 */

const MAX_FILE = 20 * 1024 * 1024;
const MAX_TOTAL = 300 * 1024 * 1024;

export function readSubstackExport(zip: Uint8Array): ImportedPost[] {
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip, {
      filter: (f) => {
        const wanted = /(^|\/)posts\.csv$/.test(f.name) || /(^|\/)posts\/[^/]+\.html$/.test(f.name);
        if (!wanted) return false;
        if (f.originalSize > MAX_FILE) return false;
        total += f.originalSize;
        if (total > MAX_TOTAL) throw new ImportError("This export is too large to import at once.");
        return true;
      },
    });
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError("That isn't a ZIP file. Upload the export exactly as Substack sent it.");
  }
  const csvName = Object.keys(files).find((n) => /(^|\/)posts\.csv$/.test(n));
  if (!csvName) throw new ImportError("No posts.csv in this ZIP. Is it a Substack export?");
  const prefix = csvName.slice(0, -"posts.csv".length);
  const { data } = Papa.parse<Record<string, string>>(strFromU8(files[csvName]), {
    header: true,
    skipEmptyLines: true,
  });

  const posts: ImportedPost[] = [];
  for (const row of data) {
    const id = row.post_id?.trim();
    if (!id) continue;
    const html = files[`${prefix}posts/${id}.html`];
    if (!html) continue;
    const published = row.is_published?.toLowerCase() === "true";
    const date = row.post_date || row.email_sent_at;
    const slugPart = id.includes(".") ? id.slice(id.indexOf(".") + 1) : (row.title ?? id);
    posts.push({
      key: `substack:${id.split(".")[0]}`,
      title: row.title?.trim() || "Untitled",
      subtitle: row.subtitle?.trim() || null,
      slug: slugPart,
      html: strFromU8(html),
      publishedAt: date ? new Date(date) : null,
      published,
      public: !row.audience || row.audience === "everyone" || row.audience === "only_free",
    });
  }
  return posts;
}
