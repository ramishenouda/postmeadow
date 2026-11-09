import { z } from "zod";
import { getOwnedPost } from "@/lib/posts";
import { getPublicationForUser, getSession } from "@/lib/dal";
import { getEmailRenderer } from "@/lib/email/renderers";
import { postUrl, publicationUrl } from "@/lib/urls";

const body = z.object({
  title: z.string().max(200),
  subtitle: z.string().max(300),
  slug: z.string().max(60),
  content: z.string().max(200_000),
  /** The design picked in the editor; null for the publication's. */
  design: z.string().max(40).nullable().optional(),
});

/** Renders the editor's current (unsaved) content exactly as subscribers will get it. */
export async function POST(request: Request, { params }: RouteContext<"/api/posts/[id]/preview">) {
  // Explicit checks: an API route should answer 401/404, not redirect to a page.
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!(await getPublicationForUser(session.user.id))) {
    return new Response("Not found", { status: 404 });
  }
  const owned = await getOwnedPost((await params).id);
  if (!owned) return new Response("Not found", { status: 404 });
  const { post, publication } = owned;

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const { title, subtitle, slug, content, design } = parsed.data;

  const { html } = await getEmailRenderer(post.contentFormat).render({
    post: {
      title: title || "Untitled",
      subtitle: subtitle || null,
      content,
      contentFormat: post.contentFormat,
      emailDesign: design === undefined ? post.emailDesign : design,
    },
    publication,
    urls: {
      publication: publicationUrl(publication.slug),
      webVersion: postUrl(publication.slug, slug || "preview"),
      unsubscribe: publicationUrl(publication.slug),
    },
  });

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
