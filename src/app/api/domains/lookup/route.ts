import { publicationForDomain } from "@/lib/domains";

/** Which publication lives at a domain (used by src/proxy.ts). Public: it's on the web anyway. */
export async function GET(request: Request) {
  const domain = new URL(request.url).searchParams.get("domain")?.toLowerCase() ?? "";
  const found = domain && domain.length <= 253 ? await publicationForDomain(domain) : null;
  return Response.json({ slug: found?.slug ?? null }, { headers: { "cache-control": "no-store" } });
}
