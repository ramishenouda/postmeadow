import type Stripe from "stripe";
import { parseLookupKey, type Interval, type PlanId } from "@/lib/plans";

/** Subscription statuses that keep the paid plan. past_due: Stripe is still retrying the card. */
const ENTITLED = new Set<Stripe.Subscription.Status>(["active", "trialing", "past_due"]);

/** What a Stripe subscription means for our plan. Pure (no database), so it's unit-tested. */
export function planFromSubscription(sub: Stripe.Subscription) {
  let plan: PlanId = "free";
  let addons = 0;
  let interval: Interval | null = null;
  let periodEnd = 0;
  for (const item of sub.items.data) {
    const parsed = parseLookupKey(item.price.lookup_key);
    periodEnd = Math.max(periodEnd, item.current_period_end ?? 0);
    if (!parsed) continue;
    if (parsed.item === "storage_addon") addons += item.quantity ?? 0;
    else {
      plan = parsed.item;
      interval = parsed.interval;
    }
  }
  const entitled = ENTITLED.has(sub.status);
  return {
    plan: entitled ? plan : ("free" as PlanId),
    storageAddons: entitled ? addons : 0,
    interval,
    entitled,
    periodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
  };
}
