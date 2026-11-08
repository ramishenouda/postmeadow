import "server-only";
import { eq, isNull, lte, or } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db";
import { accountBilling } from "@/db/schema";
import { planFromSubscription } from "./plan-from-subscription";

const customerId = (c: string | { id: string }) => (typeof c === "string" ? c : c.id);

/**
 * Applies a subscription from a verified webhook to the account it belongs to.
 * Events can arrive out of order, so an event older than the last one applied is ignored.
 */
export async function applySubscription(sub: Stripe.Subscription, eventCreated: Date) {
  const customer = customerId(sub.customer);
  const [existing] = await db
    .select()
    .from(accountBilling)
    .where(eq(accountBilling.stripeCustomerId, customer));
  const userId = sub.metadata?.userId || existing?.userId;
  if (!userId) {
    console.warn("Stripe subscription for an unknown customer", { customer, sub: sub.id });
    return "unknown-customer" as const;
  }

  const next = planFromSubscription(sub);

  // An abandoned or failed checkout must not downgrade a different, active subscription.
  if (
    existing?.stripeSubscriptionId &&
    existing.stripeSubscriptionId !== sub.id &&
    existing.plan !== "free" &&
    !next.entitled
  ) {
    return "ignored-other-subscription" as const;
  }

  const values = {
    plan: next.plan,
    storageAddons: next.storageAddons,
    stripeCustomerId: customer,
    stripeSubscriptionId: sub.status === "canceled" ? null : sub.id,
    billingInterval: next.entitled ? next.interval : null,
    subscriptionStatus: sub.status,
    currentPeriodEnd: next.entitled ? next.periodEnd : null,
    cancelAtPeriodEnd: next.entitled && Boolean(sub.cancel_at_period_end || sub.cancel_at),
    stripeEventAt: eventCreated,
  };
  const written = await db
    .insert(accountBilling)
    .values({ userId, ...values })
    .onConflictDoUpdate({
      target: accountBilling.userId,
      set: values,
      setWhere: or(
        isNull(accountBilling.stripeEventAt),
        lte(accountBilling.stripeEventAt, eventCreated),
      ),
    })
    .returning({ userId: accountBilling.userId });
  return written.length ? ("applied" as const) : ("stale" as const);
}

/** checkout.session.completed: remember which Stripe customer is which account. */
export async function linkCustomer(userId: string, customer: string) {
  await db
    .insert(accountBilling)
    .values({ userId, stripeCustomerId: customer })
    .onConflictDoUpdate({
      target: accountBilling.userId,
      set: { stripeCustomerId: customer },
      setWhere: isNull(accountBilling.stripeCustomerId),
    });
}
