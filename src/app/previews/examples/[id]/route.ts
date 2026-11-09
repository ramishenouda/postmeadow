import { examplePreviewHtml } from "@/lib/email/previews";

/** A starter template as a made-up brand would send it. Public: the landing page shows these. */
export async function GET(_request: Request, { params }: RouteContext<"/previews/examples/[id]">) {
  const html = await examplePreviewHtml((await params).id);
  if (!html) return new Response("Not found", { status: 404 });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
