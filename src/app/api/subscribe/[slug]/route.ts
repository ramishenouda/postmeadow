import { NextResponse, type NextRequest } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { handleSubscribeRequest } from "@/lib/subscribe-request";

/**
 * Subscribe from anywhere: a plain HTML <form> on a writer's own website posts here
 * and the reader lands on our "check your inbox" page. Scripts can send
 * `Accept: application/json` to get a JSON answer instead of a redirect.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteContext<"/api/subscribe/[slug]">,
) {
  const { slug } = await params;
  // A body can only be read once, so pick the parser from the Content-Type.
  let fields: { email?: unknown; website?: unknown; tag?: unknown };
  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      fields = await request.json();
    } else {
      const form = await request.formData();
      // "tag" may repeat: <input type="hidden" name="tag" value="…"> once per tag.
      fields = { ...Object.fromEntries(form), tag: form.getAll("tag") };
    }
  } catch {
    return NextResponse.json({ error: "Send an email field." }, { status: 400 });
  }
  const email = String(fields?.email ?? "");
  const honeypot = String(fields?.website ?? "");
  const tags = (Array.isArray(fields?.tag) ? fields.tag : fields?.tag ? [fields.tag] : [])
    .map(String)
    .slice(0, 10);

  const result = await handleSubscribeRequest({
    slug,
    email,
    honeypot,
    tags,
    ip: clientIp(request.headers),
  });

  if (request.headers.get("accept")?.includes("application/json")) {
    const status =
      result.status === "success"
        ? 200
        : result.code === "rate-limited" || result.code === "paused"
          ? 429
          : result.code === "unknown-publication"
            ? 404
            : 400;
    return NextResponse.json(
      result.status === "success"
        ? { ok: true, message: "Check your inbox to confirm." }
        : { ok: false, error: result.message },
      { status },
    );
  }

  const target = new URL(`/${slug}/check-inbox`, request.url);
  if (result.status === "error") target.searchParams.set("error", result.code);
  return NextResponse.redirect(target, 303);
}
