import assert from "node:assert/strict";
import { test } from "node:test";
import type Stripe from "stripe";
import { planFromSubscription } from "../../src/lib/billing/plan-from-subscription";
import {
  formatPrice,
  lookupKey,
  parseLookupKey,
  PLANS,
  PRICES,
  storageLimit,
  STORAGE_ADDON_BYTES,
} from "../../src/lib/plans";

/** A minimal subscription with the fields we read. */
function sub(
  status: Stripe.Subscription.Status,
  items: { key: string | null; quantity?: number; end?: number }[],
): Stripe.Subscription {
  return {
    status,
    items: {
      data: items.map((i) => ({
        price: { lookup_key: i.key },
        quantity: i.quantity ?? 1,
        current_period_end: i.end ?? 1_800_000_000,
      })),
    },
  } as unknown as Stripe.Subscription;
}

test("lookup keys round-trip and reject anything else", () => {
  assert.equal(lookupKey("pro", "month"), "postmeadow_pro_month");
  assert.deepEqual(parseLookupKey("postmeadow_business_year"), {
    item: "business",
    interval: "year",
  });
  assert.equal(parseLookupKey("postmeadow_enterprise_month"), null);
  assert.equal(parseLookupKey("someone_elses_price"), null);
  assert.equal(parseLookupKey(null), null);
});

test("yearly prices are two months free", () => {
  for (const item of ["pro", "business", "storage_addon"] as const) {
    assert.equal(PRICES[item].year, PRICES[item].month * 10);
  }
  assert.equal(formatPrice(900), "$9");
  assert.equal(formatPrice(250), "$2.50");
});

test("active subscription → plan, interval and add-ons", () => {
  const r = planFromSubscription(
    sub("active", [
      { key: "postmeadow_pro_year" },
      { key: "postmeadow_storage_addon_year", quantity: 3 },
    ]),
  );
  assert.deepEqual(
    { plan: r.plan, addons: r.storageAddons, interval: r.interval, entitled: r.entitled },
    { plan: "pro", addons: 3, interval: "year", entitled: true },
  );
  assert.equal(r.periodEnd?.getTime(), 1_800_000_000_000);
  assert.equal(
    storageLimit(r.plan, r.storageAddons),
    PLANS.pro.storageBytes + 3 * STORAGE_ADDON_BYTES,
  );
});

test("a failed payment (past_due) keeps the plan while Stripe retries", () => {
  assert.equal(
    planFromSubscription(sub("past_due", [{ key: "postmeadow_business_month" }])).plan,
    "business",
  );
});

test("cancelled, unpaid or never-completed subscriptions mean Free with no add-ons", () => {
  for (const status of [
    "canceled",
    "unpaid",
    "incomplete",
    "incomplete_expired",
    "paused",
  ] as const) {
    const r = planFromSubscription(
      sub(status, [
        { key: "postmeadow_pro_month" },
        { key: "postmeadow_storage_addon_month", quantity: 2 },
      ]),
    );
    assert.deepEqual([r.plan, r.storageAddons, r.entitled], ["free", 0, false], status);
  }
});

test("prices that aren't ours are ignored", () => {
  assert.equal(planFromSubscription(sub("active", [{ key: null }])).plan, "free");
});

test("add-ons never raise the Free plan's limit", () => {
  assert.equal(storageLimit("free", 5), PLANS.free.storageBytes);
  assert.equal(storageLimit("unknown-plan", 0), PLANS.free.storageBytes);
});
