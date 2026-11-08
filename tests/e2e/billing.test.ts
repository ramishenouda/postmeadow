/**
 * Billing: checkout and portal against stripe-mock, plan changes through signed
 * Stripe webhooks (the only path that changes a plan).
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import Stripe from "stripe";
import { BASE, Client, createOwner, resetDatabase, scalar, sql } from "./helpers";

const SECRET = process.env.E2E_STRIPE_WEBHOOK_SECRET!;
const stripe = new Stripe("sk_test_unused"); // only for signing test webhooks

let owner: Client;
let userId: string;
let customerId: string;
let eventSeq = 0;
let clock = Math.floor(Date.now() / 1000);

/** Posts a Stripe event to our webhook, signed like Stripe does. */
async function sendStripeEvent(
  type: string,
  object: Record<string, unknown>,
  { id = `evt_${++eventSeq}_${Date.now()}`, created = ++clock, secret = SECRET } = {},
) {
  const payload = JSON.stringify({ id, type, created, object: "event", data: { object } });
  return fetch(`${BASE}/api/webhooks/stripe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret }),
    },
    body: payload,
  });
}

function subscription(
  status: string,
  items: { key: string; quantity?: number }[],
  extra: Record<string, unknown> = {},
) {
  return {
    id: "sub_main",
    object: "subscription",
    customer: customerId,
    status,
    cancel_at_period_end: false,
    cancel_at: null,
    metadata: { userId },
    items: {
      data: items.map((i, n) => ({
        id: `si_${n}`,
        price: { id: `price_${i.key}`, lookup_key: i.key },
        quantity: i.quantity ?? 1,
        current_period_end: 1_900_000_000,
      })),
    },
    ...extra,
  };
}

const billing = async () =>
  (
    await sql`select plan, storage_addons, subscription_status, billing_interval, cancel_at_period_end,
               stripe_subscription_id from account_billing where user_id = ${userId}`
  )[0];

before(async () => {
  await resetDatabase();
  ({ owner } = await createOwner("payer@example.com", "payer-pub"));
  userId = await scalar(sql`select id from "user" where email = 'payer@example.com'`);
});
after(() => sql.end());

describe("billing page and checkout", () => {
  test("signed-out visitors land on billing after signing in", async () => {
    const res = await new Client().fetch("/dashboard/billing");
    assert.equal(res.status, 307);
    assert.match(res.headers.get("location") ?? "", /\/sign-in\?next=%2Fdashboard%2Fbilling$/);
  });

  test("the billing page shows the plans with prices from plans.ts", async () => {
    const html = (await owner.page("/dashboard/billing")).replaceAll("<!-- -->", "");
    assert.match(html, /Free plan/);
    assert.match(html, /\$9/);
    assert.match(html, /\$29/);
    assert.match(html, /Upgrade to Pro/);
  });

  test("checkout creates a Stripe customer and returns Stripe's checkout URL", async () => {
    const { result } = await owner.action("/dashboard/billing", "billing/actions", "checkout", [
      "pro",
      "month",
    ]);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.match(result.url, /^https:\/\/checkout\.stripe\.com\//);
    customerId = await scalar(
      sql`select stripe_customer_id from account_billing where user_id = ${userId}`,
    );
    assert.match(customerId, /^cus_/);
    assert.equal((await billing()).plan, "free", "the plan must not change before Stripe confirms");
  });

  test("unknown plans are refused", async () => {
    const { result } = await owner.action("/dashboard/billing", "billing/actions", "checkout", [
      "enterprise",
      "month",
    ]);
    assert.equal(result.ok, false);
  });
});

describe("webhook", () => {
  test("bad signatures are rejected", async () => {
    const res = await sendStripeEvent("customer.subscription.created", subscription("active", []), {
      secret: "whsec_wrong",
    });
    assert.equal(res.status, 400);
  });

  test("a new subscription upgrades the plan and the storage limit", async () => {
    const res = await sendStripeEvent(
      "customer.subscription.created",
      subscription("active", [{ key: "postmeadow_pro_month" }]),
    );
    assert.equal((await res.json()).result, "applied");
    assert.deepEqual(
      { ...(await billing()) },
      {
        plan: "pro",
        storage_addons: 0,
        subscription_status: "active",
        billing_interval: "month",
        cancel_at_period_end: false,
        stripe_subscription_id: "sub_main",
      },
    );
    const html = (await owner.page("/dashboard/billing")).replaceAll("<!-- -->", "");
    assert.match(html, /Pro plan/);
    assert.match(html, /of 10 GB/);
    assert.match(html, /Renews on/);
  });

  test("storage add-ons raise the limit", async () => {
    await sendStripeEvent(
      "customer.subscription.updated",
      subscription("active", [
        { key: "postmeadow_pro_month" },
        { key: "postmeadow_storage_addon_month", quantity: 2 },
      ]),
    );
    assert.equal((await billing()).storage_addons, 2);
    assert.match((await owner.page("/dashboard/billing")).replaceAll("<!-- -->", ""), /of 30 GB/);
  });

  test("an older event arriving late is ignored", async () => {
    const res = await sendStripeEvent(
      "customer.subscription.updated",
      subscription("active", [{ key: "postmeadow_pro_month" }]),
      { created: clock - 100 },
    );
    assert.equal((await res.json()).result, "stale");
    assert.equal((await billing()).storage_addons, 2);
  });

  test("the same event delivered twice is processed once", async () => {
    const event = subscription("active", [
      { key: "postmeadow_business_year" },
      { key: "postmeadow_storage_addon_year", quantity: 1 },
    ]);
    const first = await sendStripeEvent("customer.subscription.updated", event, { id: "evt_dupe" });
    const second = await sendStripeEvent("customer.subscription.updated", event, {
      id: "evt_dupe",
    });
    assert.equal((await first.json()).result, "applied");
    assert.equal((await second.json()).duplicate, true);
    assert.deepEqual(
      [(await billing()).plan, (await billing()).billing_interval],
      ["business", "year"],
    );
  });

  test("an abandoned checkout for another subscription doesn't downgrade", async () => {
    const res = await sendStripeEvent(
      "customer.subscription.updated",
      subscription("incomplete_expired", [{ key: "postmeadow_pro_month" }], { id: "sub_other" }),
    );
    assert.equal((await res.json()).result, "ignored-other-subscription");
    assert.equal((await billing()).plan, "business");
  });

  test("a failed payment keeps the plan and shows a warning", async () => {
    await sendStripeEvent(
      "customer.subscription.updated",
      subscription("past_due", [{ key: "postmeadow_business_year" }]),
    );
    assert.equal((await billing()).plan, "business");
    assert.match(await owner.page("/dashboard/billing"), /payment didn(&#x27;|')t go through/);
  });

  test("cancelling at period end keeps the plan until then", async () => {
    await sendStripeEvent(
      "customer.subscription.updated",
      subscription("active", [{ key: "postmeadow_business_year" }], { cancel_at_period_end: true }),
    );
    assert.equal((await billing()).cancel_at_period_end, true);
    assert.match((await owner.page("/dashboard/billing")).replaceAll("<!-- -->", ""), /Ends on/);
  });

  test("when the subscription ends, the account is back on Free", async () => {
    await sendStripeEvent(
      "customer.subscription.deleted",
      subscription("canceled", [
        { key: "postmeadow_business_year" },
        { key: "postmeadow_storage_addon_year", quantity: 1 },
      ]),
    );
    const b = await billing();
    assert.deepEqual([b.plan, b.storage_addons, b.stripe_subscription_id], ["free", 0, null]);
  });
});

describe("actions with a live subscription", () => {
  before(async () => {
    await sendStripeEvent(
      "customer.subscription.created",
      subscription("active", [{ key: "postmeadow_pro_month" }]),
    );
  });

  test("starting a second checkout is refused", async () => {
    const { result } = await owner.action("/dashboard/billing", "billing/actions", "checkout", [
      "business",
      "month",
    ]);
    assert.equal(result.ok, false);
    assert.match(result.error, /already have a subscription/);
  });

  test("switching plans and changing add-ons go through Stripe", async () => {
    const page = "/dashboard/billing";
    const sw = await owner.action(page, "billing/actions", "switchPlan", ["business", "year"]);
    assert.equal(sw.result.ok, true, JSON.stringify(sw.result));
    const addons = await owner.action(page, "billing/actions", "updateStorageAddons", [3]);
    assert.equal(addons.result.ok, true, JSON.stringify(addons.result));
    const tooMany = await owner.action(page, "billing/actions", "updateStorageAddons", [500]);
    assert.equal(tooMany.result.ok, false);
    // Nothing changes locally until Stripe's webhook says so.
    assert.equal((await billing()).plan, "pro");
  });

  test("the customer portal link comes from Stripe", async () => {
    const { result } = await owner.action(
      "/dashboard/billing",
      "billing/actions",
      "manageBilling",
      [],
    );
    assert.equal(result.ok, true);
    assert.match(result.url, /^https:\/\//);
  });
});
