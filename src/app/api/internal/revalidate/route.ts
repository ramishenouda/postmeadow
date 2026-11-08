import { revalidateTag } from "next/cache";
import { isInternalToken } from "@/lib/revalidate";

/** Internal: lets background work (the scheduler) refresh cached pages. See src/lib/revalidate.ts. */
export async function POST(request: Request) {
  if (!isInternalToken(request.headers.get("x-internal-token"))) {
    return new Response("Not found", { status: 404 });
  }
  const { tag } = (await request.json().catch(() => ({}))) as { tag?: unknown };
  if (typeof tag !== "string" || !/^publication:[a-z0-9-]{1,60}$/.test(tag)) {
    return new Response("Bad request", { status: 400 });
  }
  revalidateTag(tag, { expire: 0 });
  return Response.json({ ok: true });
}
