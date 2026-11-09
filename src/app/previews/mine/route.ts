import { getPublicationForUser, getSession } from "@/lib/dal";
import { designPreviewHtml, isPreviewDesign, templatePreviewHtml } from "@/lib/email/previews";

/**
 * Previews with the signed-in writer's name, logo and colour:
 *   ?template=<starter id>  a starter template, in its design (or the publication's)
 *   ?design=<design>        a design, with content that suits it (Settings)
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const publication = await getPublicationForUser(session.user.id);
  if (!publication) return new Response("Not found", { status: 404 });

  const brand = {
    name: publication.name,
    accentColor: publication.accentColor,
    logoUrl: publication.logoUrl,
    fontStyle: publication.fontStyle,
    fromName: publication.fromName,
  };
  const params = new URL(request.url).searchParams;
  const design = params.get("design");
  const template = params.get("template");
  const fallback = isPreviewDesign(publication.emailDesign) ? publication.emailDesign : "classic";

  const html = isPreviewDesign(design)
    ? await designPreviewHtml(design, brand)
    : template
      ? await templatePreviewHtml(template, brand, fallback)
      : null;
  if (!html) return new Response("Not found", { status: 404 });
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-cache" },
  });
}
