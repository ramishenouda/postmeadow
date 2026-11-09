import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db";
import { publications, subscribers } from "@/db/schema";
import { getBilling } from "@/lib/billing/service";
import { getStripe } from "@/lib/billing/stripe";
import { randomToken } from "@/lib/tokens";
import { absoluteUrl } from "@/lib/urls";
import { FEE_PERCENT } from "@/lib/fees";

/**
 * Paid subscriptions. Writers connect a Stripe account (Connect Express) and set a
 * monthly and a yearly price. Readers pay through Stripe Checkout on our platform
 * account; each payment goes to the writer's account minus our fee
 * (application_fee_percent), so writers get paid out by Stripe directly.
 *
 * Webhooks (customer.subscription.* with metadata.kind = "reader") keep
 * subscribers.paid_* in sync.
 */

export class PaidError extends Error {}

export { FEE_PERCENT };
export const feePercent = (plan: string | null | undefined) =>
  FEE_PERCENT[(plan ?? "free") as keyof typeof FEE_PERCENT] ?? FEE_PERCENT.free;

export const CURRENCIES = ["usd", "eur", "gbp", "cad", "aud", "chf", "sek", "nok", "dkk"] as const;
export const MIN_PRICE_CENTS = 100;
export const MAX_PRICE_CENTS = 100_000;

type Publication = typeof publications.$inferSelect;

function stripe() {
  const client = getStripe();
  if (!client) throw new PaidError("Payments aren't set up on this server yet.");
  return client;
}

/** A paying reader right now (past_due keeps access while Stripe retries the card). */
export function hasPaidAccess(s: { paidStatus: string | null; paidUntil: Date | null }) {
  if (s.paidStatus === "active") return true;
  return s.paidStatus === "past_due" && Boolean(s.paidUntil && s.paidUntil > new Date());
}

/** SQL for "pays right now", for queries over subscribers. */
export const paidAccessSql = sql`(${subscribers.paidStatus} = 'active' or (${subscribers.paidStatus} = 'past_due' and ${subscribers.paidUntil} > now()))`;

/** Readers can pay: Stripe connected and able to charge, prices set, switched on. */
export const acceptsPayments = (p: Publication) =>
  Boolean(
    p.paidEnabled &&
    p.stripeAccountId &&
    p.stripeChargesEnabled &&
    (p.paidMonthlyPriceId || p.paidYearlyPriceId),
  );

// ─── Writer side ─────────────────────────────────────────────────────────────

/** Where to send the writer to set up (or finish setting up) their Stripe account. */
export async function connectLink(publication: Publication, email: string): Promise<string> {
  let account = publication.stripeAccountId;
  if (!account) {
    const created = await stripe().accounts.create({
      type: "express",
      email,
      business_profile: { name: publication.name, url: absoluteUrl(`/${publication.slug}`) },
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { publicationId: publication.id },
    });
    account = created.id;
    await db
      .update(publications)
      .set({ stripeAccountId: account })
      .where(eq(publications.id, publication.id));
  }
  const link = await stripe().accountLinks.create({
    account,
    type: "account_onboarding",
    refresh_url: absoluteUrl("/dashboard/monetize?refresh=1"),
    return_url: absoluteUrl("/dashboard/monetize?connected=1"),
  });
  return link.url;
}

/** Re-reads whether the connected account can take payments. */
export async function refreshAccount(publication: Publication) {
  if (!publication.stripeAccountId) return false;
  const account = await stripe().accounts.retrieve(publication.stripeAccountId);
  return setChargesEnabled(account.id, Boolean(account.charges_enabled));
}

export async function setChargesEnabled(accountId: string, enabled: boolean) {
  await db
    .update(publications)
    .set({ stripeChargesEnabled: enabled })
    .where(eq(publications.stripeAccountId, accountId));
  return enabled;
}

/** Stripe Express dashboard (payouts, balance), for a connected writer. */
export async function expressDashboardUrl(publication: Publication) {
  if (!publication.stripeAccountId) throw new PaidError("Connect Stripe first.");
  const link = await stripe().accounts.createLoginLink(publication.stripeAccountId);
  return link.url;
}

/**
 * Saves prices. Stripe prices can't change, so a new amount makes a new price;
 * existing subscribers keep theirs.
 */
export async function savePrices(
  publication: Publication,
  input: {
    currency: string;
    monthlyCents: number | null;
    yearlyCents: number | null;
    description: string;
  },
) {
  const currency = input.currency.toLowerCase();
  if (!(CURRENCIES as readonly string[]).includes(currency))
    throw new PaidError("Pick a currency.");
  for (const cents of [input.monthlyCents, input.yearlyCents]) {
    if (cents !== null && (cents < MIN_PRICE_CENTS || cents > MAX_PRICE_CENTS)) {
      throw new PaidError("Prices must be between 1 and 1,000.");
    }
  }
  if (input.monthlyCents === null && input.yearlyCents === null) {
    throw new PaidError("Set a monthly price, a yearly price, or both.");
  }
  const s = stripe();
  let product = publication.paidProductId;
  if (!product) {
    product = (
      await s.products.create({
        name: `${publication.name}: paid subscription`,
        metadata: { publicationId: publication.id },
      })
    ).id;
  }
  const currencyChanged = currency !== publication.paidCurrency;
  const price = async (
    cents: number | null,
    old: number | null,
    oldId: string | null,
    interval: "month" | "year",
  ) => {
    if (cents === null) return null;
    if (oldId && cents === old && !currencyChanged) return oldId;
    return (
      await s.prices.create({
        product: product!,
        currency,
        unit_amount: cents,
        recurring: { interval },
        metadata: { publicationId: publication.id },
      })
    ).id;
  };
  const monthlyId = await price(
    input.monthlyCents,
    publication.paidMonthlyCents,
    publication.paidMonthlyPriceId,
    "month",
  );
  const yearlyId = await price(
    input.yearlyCents,
    publication.paidYearlyCents,
    publication.paidYearlyPriceId,
    "year",
  );
  await db
    .update(publications)
    .set({
      paidCurrency: currency,
      paidMonthlyCents: input.monthlyCents,
      paidYearlyCents: input.yearlyCents,
      paidMonthlyPriceId: monthlyId,
      paidYearlyPriceId: yearlyId,
      paidProductId: product,
      paidDescription: input.description.trim().slice(0, 1000) || null,
    })
    .where(eq(publications.id, publication.id));
}

export async function paidStats(publicationId: string) {
  const [row] = await db.execute<{ paying: number; monthly: number; yearly: number }>(sql`
    select
      count(*) filter (where ${paidAccessSql})::int as paying,
      count(*) filter (where ${paidAccessSql} and paid_interval = 'month')::int as monthly,
      count(*) filter (where ${paidAccessSql} and paid_interval = 'year')::int as yearly
    from subscribers where publication_id = ${publicationId}
  `);
  return row;
}

// ─── Reader side ─────────────────────────────────────────────────────────────

/** Stripe Checkout for a reader. Returns the URL to send them to. */
export async function readerCheckout(
  publication: Publication,
  email: string,
  interval: "month" | "year",
) {
  if (!acceptsPayments(publication))
    throw new PaidError("This publication doesn't take payments yet.");
  const price =
    interval === "year" ? publication.paidYearlyPriceId : publication.paidMonthlyPriceId;
  if (!price) throw new PaidError("Pick another option.");
  const billing = await getBilling(publication.ownerId);
  const metadata = { kind: "reader", publicationId: publication.id, email };
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    customer_email: email,
    success_url: absoluteUrl(
      `/${publication.slug}/upgrade/thanks?session_id={CHECKOUT_SESSION_ID}`,
    ),
    cancel_url: absoluteUrl(`/${publication.slug}/upgrade`),
    metadata,
    subscription_data: {
      metadata,
      application_fee_percent: feePercent(billing?.plan),
      transfer_data: { destination: publication.stripeAccountId! },
    },
  });
  if (!session.url) throw new PaidError("Checkout couldn't start. Try again.");
  return session.url;
}

const PAID_STATUS: Partial<Record<Stripe.Subscription.Status, string>> = {
  active: "active",
  trialing: "active",
  past_due: "past_due",
  unpaid: "canceled",
  canceled: "canceled",
  incomplete_expired: "canceled",
  paused: "canceled",
};

/**
 * Applies a reader's subscription from a verified webhook. Someone who pays and wasn't
 * subscribed yet is subscribed now (they chose to pay for the emails).
 */
export async function applyReaderSubscription(sub: Stripe.Subscription) {
  const publicationId = sub.metadata?.publicationId;
  const email = sub.metadata?.email?.trim().toLowerCase();
  if (!publicationId || !email) return "reader-missing-metadata" as const;
  const status = PAID_STATUS[sub.status];
  if (!status) return "reader-ignored" as const; // incomplete: wait for the next event
  const periodEnd = Math.max(0, ...sub.items.data.map((i) => i.current_period_end ?? 0));
  const interval = sub.items.data[0]?.price.recurring?.interval ?? null;
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const values = {
    paidStatus: status,
    paidUntil: periodEnd ? new Date(periodEnd * 1000) : null,
    paidInterval: interval,
    stripeCustomerId: customer,
    stripeSubscriptionId: sub.id,
  };
  const [existing] = await db
    .select({ id: subscribers.id, status: subscribers.status })
    .from(subscribers)
    .where(and(eq(subscribers.publicationId, publicationId), eq(subscribers.email, email)));
  if (existing) {
    await db
      .update(subscribers)
      .set({
        ...values,
        // Paying (again) means they want the emails, unless their address bounces.
        ...(status === "active" && existing.status !== "bounced"
          ? { status: "active" as const, confirmToken: null, statusReason: null }
          : {}),
        ...(status === "active" && existing.status !== "active" && existing.status !== "bounced"
          ? { confirmedAt: new Date() }
          : {}),
      })
      .where(eq(subscribers.id, existing.id));
    return "reader-updated" as const;
  }
  if (status !== "active") return "reader-ignored" as const;
  await db
    .insert(subscribers)
    .values({
      publicationId,
      email,
      status: "active",
      confirmedAt: new Date(),
      unsubscribeToken: randomToken(),
      source: "paid",
      ...values,
    })
    .onConflictDoNothing();
  return "reader-created" as const;
}

/** Stripe's billing page for a reader (change card, cancel). */
export async function readerPortalUrl(customer: string, returnUrl: string) {
  const session = await stripe().billingPortal.sessions.create({ customer, return_url: returnUrl });
  return session.url;
}
