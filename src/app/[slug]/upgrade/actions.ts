"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { publications, subscribers } from "@/db/schema";
import { clientIp } from "@/lib/client-ip";
import { liveDomain } from "@/lib/domains";
import { sendNotice } from "@/lib/notify";
import { hasPaidAccess, PaidError, readerCheckout } from "@/lib/paid";
import { hit } from "@/lib/rate-limit";
import { reportError } from "@/lib/report";
import { sign } from "@/lib/signed";
import { emailSchema } from "@/lib/subscribers";
import { absoluteUrl } from "@/lib/urls";

export type UpgradeState = { status: "idle" } | { status: "error"; message: string };

/** Off to Stripe Checkout. */
export async function startUpgrade(
  slug: string,
  _prev: UpgradeState,
  formData: FormData,
): Promise<UpgradeState> {
  const email = emailSchema.safeParse(String(formData.get("email") ?? ""));
  if (!email.success) return { status: "error", message: "Enter a valid email address." };
  if (!(await hit(`upgrade:${clientIp(await headers())}`, { limit: 20, windowSeconds: 600 }))) {
    return { status: "error", message: "Too many attempts. Try again in a few minutes." };
  }
  const [publication] = await db.select().from(publications).where(eq(publications.slug, slug));
  if (!publication) return { status: "error", message: "This publication no longer exists." };
  const interval = formData.get("interval") === "year" ? "year" : "month";
  let url: string;
  try {
    url = await readerCheckout(publication, email.data, interval);
  } catch (error) {
    if (error instanceof PaidError) return { status: "error", message: error.message };
    reportError("reader checkout failed", error);
    return { status: "error", message: "Checkout couldn't start. Try again in a moment." };
  }
  redirect(url);
}

export type LoginLinkState = { status: "idle" } | { status: "sent" };

/** Emails a paying reader a link that unlocks paid posts in this browser. */
export async function sendPaidLoginLink(
  slug: string,
  next: string,
  _prev: LoginLinkState,
  formData: FormData,
): Promise<LoginLinkState> {
  const email = emailSchema.safeParse(String(formData.get("email") ?? ""));
  // Same answer whether or not the address pays: don't reveal who subscribes.
  if (!email.success) return { status: "sent" };
  const ip = clientIp(await headers());
  if (!(await hit(`paid-login:${ip}`, { limit: 10, windowSeconds: 600 })))
    return { status: "sent" };
  if (!(await hit(`paid-login:${email.data}`, { limit: 3, windowSeconds: 3600 })))
    return { status: "sent" };
  const [row] = await db
    .select({
      id: subscribers.id,
      paidStatus: subscribers.paidStatus,
      paidUntil: subscribers.paidUntil,
      name: publications.name,
      customDomain: publications.customDomain,
      customDomainVerifiedAt: publications.customDomainVerifiedAt,
    })
    .from(subscribers)
    .innerJoin(publications, eq(publications.id, subscribers.publicationId))
    .where(and(eq(publications.slug, slug), eq(subscribers.email, email.data)));
  if (row && hasPaidAccess(row)) {
    const token = sign("paid-login", row.id, 3600);
    const safeNext = /^\/[\w\-/]*$/.test(next) ? next : `/${slug}`;
    const domain = liveDomain(row);
    const base = domain ? `https://${domain}/access` : absoluteUrl(`/${slug}/access`);
    await sendNotice(email.data, `Your link to read ${row.name}`, {
      title: `Read ${row.name}`,
      paragraphs: [
        "Here's your link to read paid posts in this browser. It works for an hour.",
        "If you didn't ask for it, ignore this email.",
      ],
      action: {
        label: "Open my posts",
        url: `${base}?t=${encodeURIComponent(token)}&next=${encodeURIComponent(safeNext)}`,
      },
    });
  }
  return { status: "sent" };
}
