import "server-only";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { createElement } from "react";
import { z } from "zod";
import { db } from "@/db";
import { env } from "@/env";
import { publications, subscribers } from "@/db/schema";
import ConfirmSubscriptionEmail from "@/emails/confirm-subscription";
import { renderEmail } from "@/lib/email/render";
import { hit, RateLimitError } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email/send";
import { randomToken } from "@/lib/tokens";
import { confirmUrl } from "@/lib/urls";

/** Don't send another confirmation to the same address more often than this. */
const CONFIRM_RESEND_COOLDOWN_MS = 10 * 60 * 1000;
/**
 * Cap on confirmation emails per publication. Backstop for when per-IP limits are
 * bypassed (spoofed or rotating IPs): it bounds how many strangers can be emailed.
 */
const CONFIRMATIONS_PER_PUBLICATION = {
  limit: env.CONFIRMATIONS_PER_PUBLICATION_PER_HOUR,
  windowSeconds: 60 * 60,
};
/** Confirmation links stop working after this. */
const CONFIRM_TOKEN_TTL = "7 days";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address").max(254));

type Publication = { id: string; name: string };

/**
 * Double opt-in. Always behaves the same from the outside, so the form can't be
 * used to find out who is subscribed.
 */
export async function requestSubscription(publication: Publication, email: string) {
  const [existing] = await db
    .select()
    .from(subscribers)
    .where(and(eq(subscribers.publicationId, publication.id), eq(subscribers.email, email)))
    .limit(1);

  if (existing?.status === "active" || existing?.status === "bounced") return;

  if (
    existing?.confirmSentAt &&
    Date.now() - existing.confirmSentAt.getTime() < CONFIRM_RESEND_COOLDOWN_MS
  ) {
    return;
  }

  if (!(await hit(`subscribe:publication:${publication.id}`, CONFIRMATIONS_PER_PUBLICATION))) {
    console.warn("confirmation cap reached", { publicationId: publication.id });
    throw new RateLimitError("Sign-ups are paused for a moment. Try again later.");
  }

  const token = randomToken();
  const now = new Date();

  if (existing) {
    await db
      .update(subscribers)
      .set({ status: "pending", confirmToken: token, confirmSentAt: now, statusReason: null })
      .where(eq(subscribers.id, existing.id));
  } else {
    const inserted = await db
      .insert(subscribers)
      .values({
        publicationId: publication.id,
        email,
        status: "pending",
        confirmToken: token,
        confirmSentAt: now,
        unsubscribeToken: randomToken(),
      })
      .onConflictDoNothing()
      .returning({ id: subscribers.id });
    // Lost a race with a concurrent signup for the same address; that one sends the email.
    if (inserted.length === 0) return;
  }

  const { html, text } = await renderEmail(
    createElement(ConfirmSubscriptionEmail, {
      publicationName: publication.name,
      confirmUrl: confirmUrl(token),
    }),
  );
  await sendEmail({
    to: email,
    subject: `Confirm your subscription to ${publication.name}`,
    html,
    text,
  });
}

/** Returns the publication slug on success, or null if the link is invalid or expired. */
export async function confirmSubscription(token: string): Promise<string | null> {
  const [confirmed] = await db
    .update(subscribers)
    .set({ status: "active", confirmedAt: new Date(), confirmToken: null })
    .where(
      and(
        eq(subscribers.confirmToken, token),
        eq(subscribers.status, "pending"),
        gt(subscribers.confirmSentAt, sql`now() - ${CONFIRM_TOKEN_TTL}::interval`),
      ),
    )
    .returning({ publicationId: subscribers.publicationId });
  if (!confirmed) return null;

  const [publication] = await db
    .select({ slug: publications.slug })
    .from(publications)
    .where(eq(publications.id, confirmed.publicationId));
  return publication?.slug ?? null;
}

/** Look up a subscriber by unsubscribe token, with their publication. */
export async function findByUnsubscribeToken(token: string) {
  const [row] = await db
    .select({
      id: subscribers.id,
      email: subscribers.email,
      status: subscribers.status,
      publicationName: publications.name,
      publicationSlug: publications.slug,
    })
    .from(subscribers)
    .innerJoin(publications, eq(subscribers.publicationId, publications.id))
    .where(eq(subscribers.unsubscribeToken, token))
    .limit(1);
  return row ?? null;
}

/** Idempotent. Returns false if the token doesn't match anyone. */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  const subscriber = await findByUnsubscribeToken(token);
  if (!subscriber) return false;
  await db
    .update(subscribers)
    .set({ status: "unsubscribed", unsubscribedAt: new Date(), confirmToken: null })
    .where(
      and(
        eq(subscribers.unsubscribeToken, token),
        inArray(subscribers.status, ["active", "pending"]),
      ),
    );
  return true;
}
