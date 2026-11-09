import { and, eq, gt, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { subscribers } from "@/db/schema";

/** Confirmation and invitation links stop working after this. */
export const CONFIRM_TTL_DAYS = 7;
const CONFIRM_TOKEN_TTL = `${CONFIRM_TTL_DAYS} days`;

// ─── How a subscriber's state is shown ───────────────────────────────────────

/**
 * Status as the writer sees it. "pending" splits three ways: invited by the writer,
 * signed up themselves (unconfirmed), or either one left unanswered too long (expired).
 */
export type SubscriberState =
  "active" | "invited" | "unconfirmed" | "expired" | "declined" | "unsubscribed" | "bounced";

export const SUBSCRIBER_STATES: SubscriberState[] = [
  "active",
  "invited",
  "unconfirmed",
  "expired",
  "declined",
  "unsubscribed",
  "bounced",
];

/** When a pending confirmation or invitation stops working. */
export function expiresAt(confirmSentAt: Date | null): Date | null {
  return confirmSentAt ? new Date(confirmSentAt.getTime() + CONFIRM_TTL_DAYS * 864e5) : null;
}

export function subscriberState(
  s: { status: string; invitedAt: Date | null; confirmSentAt: Date | null },
  now = new Date(),
): SubscriberState {
  if (s.status !== "pending") return s.status as SubscriberState;
  const expiry = expiresAt(s.confirmSentAt);
  if (!expiry || expiry <= now) return "expired";
  return s.invitedAt ? "invited" : "unconfirmed";
}

/** The same rules in SQL, for filtering lists and counting. */
export function subscriberStateWhere(state: SubscriberState): SQL {
  const fresh = gt(subscribers.confirmSentAt, sql`now() - ${CONFIRM_TOKEN_TTL}::interval`);
  switch (state) {
    case "invited":
      return and(eq(subscribers.status, "pending"), isNotNull(subscribers.invitedAt), fresh)!;
    case "unconfirmed":
      return and(eq(subscribers.status, "pending"), isNull(subscribers.invitedAt), fresh)!;
    case "expired":
      return and(
        eq(subscribers.status, "pending"),
        or(
          isNull(subscribers.confirmSentAt),
          lte(subscribers.confirmSentAt, sql`now() - ${CONFIRM_TOKEN_TTL}::interval`),
        ),
      )!;
    default:
      return eq(subscribers.status, state);
  }
}

/**
 * Who can be removed. Records of people saying no (declined, unsubscribed), of
 * addresses that bounce, and invitations still out there are kept: deleting them
 * would let them be invited or added again.
 */
export function canRemove(s: { status: string; invitedAt: Date | null }): boolean {
  if (s.status === "active") return true;
  return s.status === "pending" && s.invitedAt === null; // signed up, never confirmed
}
