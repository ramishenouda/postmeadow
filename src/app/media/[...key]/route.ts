import { getStorage, KEY_PATTERN } from "@/lib/storage";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", gif: "image/gif" };

/** Serves uploaded files. Keys contain a random id and never change, so caching is forever. */
export async function GET(_request: Request, { params }: RouteContext<"/media/[...key]">) {
  const key = (await params).key.join("/");
  if (!KEY_PATTERN.test(key)) return new Response("Not found", { status: 404 });

  const body = await getStorage().get(key);
  if (!body) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": TYPES[key.split(".").pop()!],
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
