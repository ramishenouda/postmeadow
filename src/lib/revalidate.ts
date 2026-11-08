import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { env } from "@/env";

/**
 * Refresh cached public pages for a tag, from anywhere.
 *
 * Next.js only allows revalidateTag() while handling a request. Background work
 * that runs outside one (the scheduler) can't call it directly, so it asks this
 * same server to do it via a small internal endpoint, authenticated with a secret
 * derived from BETTER_AUTH_SECRET (no extra configuration).
 */
export async function revalidatePublicTag(tag: string): Promise<void> {
  try {
    revalidateTag(tag, { expire: 0 });
    return;
  } catch (error) {
    if (!/static generation store missing|outside a request/i.test(String(error))) throw error;
  }
  const port = process.env.PORT ?? "3000";
  const res = await fetch(`http://127.0.0.1:${port}/api/internal/revalidate`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-token": internalToken() },
    body: JSON.stringify({ tag }),
  });
  if (!res.ok) throw new Error(`internal revalidate failed: ${res.status}`);
}

export function internalToken(): string {
  return createHmac("sha256", env.BETTER_AUTH_SECRET).update("internal-revalidate").digest("hex");
}

export function isInternalToken(value: string | null): boolean {
  if (!value) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(internalToken());
  return a.length === b.length && timingSafeEqual(a, b);
}
