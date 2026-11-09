import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { subscribers } from "@/db/schema";
import { hasPaidAccess } from "@/lib/paid";
import { sign, verify } from "@/lib/signed";

/**
 * Paid posts on the web. Readers have no accounts: a paying reader's browser gets a
 * signed cookie (after checkout, or from an emailed login link) naming their
 * subscription, checked on every paid post.
 */

export const PAID_COOKIE = (slug: string) => `pmp_${slug}`;
export const ACCESS_DAYS = 60;

export const accessCookie = (subscriberId: string) =>
  sign("paid-access", subscriberId, ACCESS_DAYS * 24 * 3600);

export const cookieOptions = (secure: boolean) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure,
  path: "/",
  maxAge: ACCESS_DAYS * 24 * 3600,
});

/** The paying reader this browser belongs to, for this publication, or null. */
export async function payingReader(slug: string, publicationId: string) {
  const id = verify("paid-access", (await cookies()).get(PAID_COOKIE(slug))?.value);
  if (!id) return null;
  const [reader] = await db
    .select({
      id: subscribers.id,
      email: subscribers.email,
      publicationId: subscribers.publicationId,
      paidStatus: subscribers.paidStatus,
      paidUntil: subscribers.paidUntil,
    })
    .from(subscribers)
    .where(eq(subscribers.id, id));
  return reader && reader.publicationId === publicationId && hasPaidAccess(reader) ? reader : null;
}
