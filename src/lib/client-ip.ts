import "server-only";
import { env } from "@/env";

/**
 * Best-effort client IP from request headers (server actions have no socket address).
 *
 * Set CLIENT_IP_HEADER to the header your host sets and clients can't forge, e.g.
 * `x-real-ip` (Vercel), `fly-client-ip` (Fly.io) or `cf-connecting-ip` (Cloudflare).
 * Without it we fall back to the first X-Forwarded-For entry, which a client can
 * spoof; the per-publication limit still caps the damage in that case.
 */
export function clientIp(headers: Headers): string {
  if (env.CLIENT_IP_HEADER) {
    return headers.get(env.CLIENT_IP_HEADER)?.trim() || "unknown";
  }
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
