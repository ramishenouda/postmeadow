import { publicationForDomain } from "@/lib/domains";

/**
 * Caddy's on-demand TLS "ask" endpoint (deploy/Caddyfile): a certificate is only
 * requested for domains a publication has verified. 200 = yes, 404 = no.
 */
export async function GET(request: Request) {
  const domain = new URL(request.url).searchParams.get("domain")?.toLowerCase() ?? "";
  if (!domain || domain.length > 253) return new Response("no", { status: 404 });
  const found = await publicationForDomain(domain);
  return new Response(found ? "ok" : "no", { status: found ? 200 : 404 });
}
