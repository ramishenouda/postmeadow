import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accountBilling } from "@/db/schema";
import { env } from "@/env";
import {
  lookupKey,
  parseLookupKey,
  type Interval,
  type PaidPlanId,
  type PriceItem,
} from "@/lib/plans";
import { getStripe } from "./stripe";

/** A billing problem the user (or the operator) can act on. */
export class BillingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingError";
  }
}

const billingUrl = (query = "") => new URL(`/dashboard/billing${query}`, env.APP_URL).toString();

function stripe() {
  const client = getStripe();
  if (!client) throw new BillingError("Billing isn't set up on this server yet.");
  return client;
}

export async function getBilling(userId: string) {
  const [row] = await db.select().from(accountBilling).where(eq(accountBilling.userId, userId));
  return row ?? null;
}

const priceIds = new Map<string, string>();

/** Stripe price id for one of our prices, found by its lookup key (see npm run stripe:setup). */
async function priceId(item: PriceItem, interval: Interval): Promise<string> {
  const key = lookupKey(item, interval);
  const cached = priceIds.get(key);
  if (cached) return cached;
  const { data } = await stripe().prices.list({ lookup_keys: [key], active: true, limit: 1 });
  if (!data[0]) {
    throw new BillingError(`Price ${key} is missing in Stripe. Run: npm run stripe:setup`);
  }
  priceIds.set(key, data[0].id);
  return data[0].id;
}

async function ensureCustomer(user: { id: string; email: string; name: string }) {
  const existing = await getBilling(user.id);
  if (existing?.stripeCustomerId) return existing.stripeCustomerId;
  const customer = await stripe().customers.create({
    email: user.email,
    name: user.name || undefined,
    metadata: { userId: user.id },
  });
  await db
    .insert(accountBilling)
    .values({ userId: user.id, stripeCustomerId: customer.id })
    .onConflictDoUpdate({
      target: accountBilling.userId,
      set: { stripeCustomerId: customer.id },
    });
  return customer.id;
}

const hasLiveSubscription = (b: Awaited<ReturnType<typeof getBilling>>) =>
  Boolean(b?.stripeSubscriptionId && b.plan !== "free");

/** Hosted Stripe Checkout for a first subscription. Returns the URL to send the user to. */
export async function startCheckout(
  user: { id: string; email: string; name: string },
  plan: PaidPlanId,
  interval: Interval,
): Promise<string> {
  if (hasLiveSubscription(await getBilling(user.id))) {
    throw new BillingError("You already have a subscription. Change your plan instead.");
  }
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: await ensureCustomer(user),
    client_reference_id: user.id,
    line_items: [{ price: await priceId(plan, interval), quantity: 1 }],
    subscription_data: { metadata: { userId: user.id } },
    allow_promotion_codes: true,
    success_url: billingUrl("?checkout=success"),
    cancel_url: billingUrl(),
  });
  if (!session.url) throw new BillingError("Stripe didn't return a checkout page.");
  return session.url;
}

async function currentSubscription(userId: string) {
  const billing = await getBilling(userId);
  if (!billing?.stripeSubscriptionId || !hasLiveSubscription(billing)) {
    throw new BillingError("You don't have a paid plan yet.");
  }
  const sub = await stripe().subscriptions.retrieve(billing.stripeSubscriptionId);
  const items = sub.items.data;
  const addonItem = items.find((i) => parseLookupKey(i.price.lookup_key)?.item === "storage_addon");
  const planItem = items.find((i) => i !== addonItem);
  return { billing, sub, planItem, addonItem };
}

/**
 * Switch between paid plans or billing periods, prorated. The add-on follows the
 * new period, because every item in a Stripe subscription must share one interval.
 * Our database changes when Stripe's webhook confirms it.
 */
export async function changePlan(userId: string, plan: PaidPlanId, interval: Interval) {
  const { sub, planItem, addonItem, billing } = await currentSubscription(userId);
  if (!planItem) throw new BillingError("Couldn't find your plan in Stripe.");
  const items: { id: string; price: string }[] = [
    { id: planItem.id, price: await priceId(plan, interval) },
  ];
  if (addonItem && billing.billingInterval !== interval) {
    items.push({ id: addonItem.id, price: await priceId("storage_addon", interval) });
  }
  await stripe().subscriptions.update(sub.id, {
    items,
    proration_behavior: "create_prorations",
    cancel_at_period_end: false,
  });
}

export const MAX_STORAGE_ADDONS = 50;

export async function setStorageAddons(userId: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_STORAGE_ADDONS) {
    throw new BillingError(`Choose between 0 and ${MAX_STORAGE_ADDONS} add-ons.`);
  }
  const { sub, addonItem, billing } = await currentSubscription(userId);
  const interval = (billing.billingInterval as Interval | null) ?? "month";
  const items = addonItem
    ? [quantity === 0 ? { id: addonItem.id, deleted: true } : { id: addonItem.id, quantity }]
    : quantity > 0
      ? [{ price: await priceId("storage_addon", interval), quantity }]
      : [];
  if (items.length === 0) return;
  await stripe().subscriptions.update(sub.id, { items, proration_behavior: "create_prorations" });
}

/** Stripe's customer portal: cards, invoices, cancelling. */
export async function portalUrl(userId: string): Promise<string> {
  const billing = await getBilling(userId);
  if (!billing?.stripeCustomerId) throw new BillingError("You don't have billing details yet.");
  const session = await stripe().billingPortal.sessions.create({
    customer: billing.stripeCustomerId,
    return_url: billingUrl(),
  });
  return session.url;
}
