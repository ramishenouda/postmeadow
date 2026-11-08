import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { deliveries, subscribers } from "@/db/schema";

/** The subset of Resend's webhook payload we use. */
export type ResendEvent = {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    to: string[];
    bounce?: { type: string; subType: string; message: string };
    suppressed?: { type: string; message: string };
    failed?: { reason?: string };
  };
};

type Outcome =
  | { kind: "hard-bounce"; reason: string }
  | { kind: "soft-bounce"; reason: string }
  | { kind: "complaint" }
  | { kind: "failed"; reason: string }
  | { kind: "ignored" };

function classify(event: ResendEvent): Outcome {
  switch (event.type) {
    case "email.bounced": {
      const b = event.data.bounce;
      const reason = [b?.subType, b?.message].filter(Boolean).join(": ") || "Bounced";
      // Only permanent bounces mean the address is dead; transient ones (full mailbox…) may recover.
      return b?.type === "Permanent"
        ? { kind: "hard-bounce", reason }
        : { kind: "soft-bounce", reason };
    }
    case "email.suppressed":
      // Resend didn't even try: the address is on its suppression list after earlier bounces.
      return {
        kind: "hard-bounce",
        reason: `Suppressed: ${event.data.suppressed?.message ?? "on the provider's suppression list"}`,
      };
    case "email.complained":
      return { kind: "complaint" };
    case "email.failed":
      return { kind: "failed", reason: event.data.failed?.reason ?? "Provider failed to send" };
    default:
      return { kind: "ignored" };
  }
}

/** Applies a verified Resend event. Safe to run twice for the same event. */
export async function handleResendEvent(event: ResendEvent): Promise<Outcome["kind"]> {
  const outcome = classify(event);
  if (outcome.kind === "ignored") return outcome.kind;

  const [delivery] = await db
    .select({ id: deliveries.id, subscriberId: deliveries.subscriberId })
    .from(deliveries)
    .where(eq(deliveries.providerMessageId, event.data.email_id))
    .limit(1);

  await db.transaction(async (tx) => {
    // 1. The delivery row, when the email was a newsletter issue.
    if (delivery) {
      const update =
        outcome.kind === "hard-bounce"
          ? { status: "bounced" as const, error: outcome.reason.slice(0, 500) }
          : outcome.kind === "complaint"
            ? { status: "complained" as const, error: "Marked as spam" }
            : outcome.kind === "failed"
              ? { status: "failed" as const, error: outcome.reason.slice(0, 500) }
              : { error: `Soft bounce: ${outcome.reason}`.slice(0, 500) };
      await tx.update(deliveries).set(update).where(eq(deliveries.id, delivery.id));
    }

    if (outcome.kind !== "hard-bounce" && outcome.kind !== "complaint") return;

    // 2. The subscriber. For newsletter issues we know exactly who; for other emails
    // (confirmation links) fall back to unconfirmed sign-ups with that address.
    const target = delivery
      ? and(
          eq(subscribers.id, delivery.subscriberId),
          inArray(subscribers.status, ["active", "pending"]),
        )
      : and(
          inArray(
            subscribers.email,
            event.data.to.map((a) => a.trim().toLowerCase()),
          ),
          eq(subscribers.status, "pending"),
        );

    await tx
      .update(subscribers)
      .set(
        outcome.kind === "hard-bounce"
          ? {
              status: "bounced",
              statusReason: `Hard bounce: ${outcome.reason}`.slice(0, 500),
              confirmToken: null,
            }
          : {
              status: "unsubscribed",
              unsubscribedAt: new Date(),
              statusReason: "Marked as spam",
              confirmToken: null,
            },
      )
      .where(target);
  });

  return outcome.kind;
}
