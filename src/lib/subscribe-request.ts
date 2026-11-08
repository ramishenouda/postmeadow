import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { publications } from "@/db/schema";
import { hit, RateLimitError } from "@/lib/rate-limit";
import { emailSchema, requestSubscription } from "@/lib/subscribers";

/** Per visitor: generous for a shared office/home IP, useless for a bot. */
const PER_IP = { limit: 10, windowSeconds: 10 * 60 };

export type SubscribeResult =
  | { status: "success"; email: string }
  | {
      status: "error";
      code: "rate-limited" | "invalid-email" | "unknown-publication" | "send-failed" | "paused";
      message: string;
      email?: string;
    };

/**
 * A public "subscribe me" request, from the publication page, the embedded form or
 * a plain HTML form on a writer's own site. Every path gets the same protection:
 * honeypot, per-IP limit, validation, double opt-in and the per-publication cap.
 */
export async function handleSubscribeRequest(input: {
  slug: string;
  email: string;
  honeypot: string;
  ip: string;
}): Promise<SubscribeResult> {
  // Honeypot: real people never fill in this hidden field. Pretend it worked.
  if (input.honeypot !== "") return { status: "success", email: "" };

  if (!(await hit(`subscribe:ip:${input.ip}`, PER_IP))) {
    return {
      status: "error",
      code: "rate-limited",
      message: "Too many attempts. Try again in a few minutes.",
      email: input.email,
    };
  }

  const parsed = emailSchema.safeParse(input.email);
  if (!parsed.success) {
    return {
      status: "error",
      code: "invalid-email",
      message: "Enter a valid email address.",
      email: input.email,
    };
  }

  const [publication] = await db
    .select({ id: publications.id, name: publications.name })
    .from(publications)
    .where(eq(publications.slug, input.slug))
    .limit(1);
  if (!publication) {
    return {
      status: "error",
      code: "unknown-publication",
      message: "This publication no longer exists.",
    };
  }

  try {
    await requestSubscription(publication, parsed.data);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { status: "error", code: "paused", message: error.message, email: input.email };
    }
    console.error("subscribe failed", error);
    return {
      status: "error",
      code: "send-failed",
      message: "We couldn't send the confirmation email. Try again in a moment.",
      email: input.email,
    };
  }
  return { status: "success", email: parsed.data };
}
