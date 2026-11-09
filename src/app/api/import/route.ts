import { publicationTag } from "@/lib/cache-tags";
import { revalidatePublicTag } from "@/lib/revalidate";
import { getMembership, getSession, hasRole } from "@/lib/dal";
import {
  fetchFeed,
  ImportError,
  readFeed,
  readGhostExport,
  readSubstackExport,
  savePosts,
  type ImportMode,
} from "@/lib/importers";
import { hit } from "@/lib/rate-limit";
import { reportError } from "@/lib/report";

const MAX_UPLOAD = 100 * 1024 * 1024;

/**
 * Imports posts from another platform (multipart form):
 *   source: "substack" (ZIP) | "ghost" (JSON) | "feed" (url or file)
 *   mode:   "archive" | "drafts"
 *   file, url, siteUrl (Ghost's address)
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first." }, { status: 401 });
  const membership = await getMembership(session.user.id);
  if (!membership || !hasRole(membership.role, "editor")) {
    return Response.json({ error: "Only editors can import posts." }, { status: 403 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD + 1024 * 1024) {
    return Response.json({ error: "Files can be at most 100 MB." }, { status: 413 });
  }
  if (!(await hit(`import:${membership.publication.id}`, { limit: 20, windowSeconds: 3600 }))) {
    return Response.json({ error: "Too many imports. Try again in an hour." }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Send the import as a form upload." }, { status: 400 });
  }
  const source = String(form.get("source") ?? "");
  const mode: ImportMode = form.get("mode") === "drafts" ? "drafts" : "archive";
  const file = form.get("file");
  const upload = file instanceof File && file.size > 0 ? file : null;

  try {
    let items;
    if (source === "substack") {
      if (!upload) throw new ImportError("Choose the ZIP file from Substack.");
      items = readSubstackExport(new Uint8Array(await upload.arrayBuffer()));
    } else if (source === "ghost") {
      if (!upload) throw new ImportError("Choose the .json file from Ghost.");
      const site = String(form.get("siteUrl") ?? "").trim();
      if (site && !/^https?:\/\/[^\s/]+/.test(site)) {
        throw new ImportError("Enter your Ghost site's address, like https://example.com");
      }
      items = readGhostExport(await upload.text(), site || null);
    } else if (source === "feed") {
      const url = String(form.get("url") ?? "").trim();
      const xml = upload
        ? await upload.text()
        : url
          ? await fetchFeed(url, { allowPrivate: process.env.IMPORT_ALLOW_PRIVATE_FEEDS === "1" })
          : null;
      if (!xml) throw new ImportError("Enter the feed's address or choose the feed file.");
      items = readFeed(xml);
    } else {
      throw new ImportError("Pick where you're importing from.");
    }
    if (items.length === 0) throw new ImportError("No posts found in that export.");

    const summary = await savePosts(membership.publication.id, session.user.id, items, mode);
    await revalidatePublicTag(publicationTag(membership.publication.slug));
    return Response.json({ ok: true, found: items.length, ...summary });
  } catch (error) {
    if (error instanceof ImportError)
      return Response.json({ error: error.message }, { status: 400 });
    reportError("import failed", error);
    return Response.json(
      { error: "The import failed. Try again, or contact support." },
      { status: 500 },
    );
  }
}
