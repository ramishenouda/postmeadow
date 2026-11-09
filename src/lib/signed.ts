import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";

/**
 * Short-lived signed values for links, e.g. "this browser just confirmed subscriber X"
 * on the page shown after confirming. Not secret, but can't be forged or reused later.
 */

const mac = (body: string) =>
  createHmac("sha256", `signed-links:${env.BETTER_AUTH_SECRET}`).update(body).digest("base64url");

export function sign(purpose: string, value: string, ttlSeconds: number): string {
  const body = `${value}.${Math.floor(Date.now() / 1000) + ttlSeconds}`;
  return `${body}.${mac(`${purpose}:${body}`)}`;
}

/** The signed value, or null if it's malformed, forged or expired. */
export function verify(purpose: string, token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [value, expires, signature] = parts;
  const expected = Buffer.from(mac(`${purpose}:${value}.${expires}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Number(expires) < Date.now() / 1000) return null;
  return value;
}
