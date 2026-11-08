"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { publications } from "@/db/schema";
import { clientIp } from "@/lib/client-ip";
import { hit, RateLimitError } from "@/lib/rate-limit";
import { emailSchema, requestSubscription } from "@/lib/subscribers";

/** Per visitor: generous for a shared office/home IP, useless for a bot. */
const PER_IP = { limit: 10, windowSeconds: 10 * 60 };

export type SubscribeState =
  | { status: "idle" }
  | { status: "success"; email: string }
  | { status: "error"; message: string; email?: string };

export async function subscribe(
  slug: string,
  _prev: SubscribeState,
  formData: FormData,
): Promise<SubscribeState> {
  // Honeypot: real people never fill in this hidden field.
  if (String(formData.get("website") ?? "") !== "") {
    return { status: "success", email: "" };
  }

  const rawEmail = String(formData.get("email") ?? "");

  if (!(await hit(`subscribe:ip:${clientIp(await headers())}`, PER_IP))) {
    return {
      status: "error",
      message: "Too many attempts. Try again in a few minutes.",
      email: rawEmail,
    };
  }

  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) {
    return { status: "error", message: "Enter a valid email address.", email: rawEmail };
  }

  const [publication] = await db
    .select({ id: publications.id, name: publications.name })
    .from(publications)
    .where(eq(publications.slug, slug))
    .limit(1);
  if (!publication) return { status: "error", message: "This publication no longer exists." };

  try {
    await requestSubscription(publication, parsed.data);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { status: "error", message: error.message, email: rawEmail };
    }
    console.error("subscribe failed", error);
    return {
      status: "error",
      message: "We couldn't send the confirmation email. Try again in a moment.",
      email: rawEmail,
    };
  }
  return { status: "success", email: parsed.data };
}
