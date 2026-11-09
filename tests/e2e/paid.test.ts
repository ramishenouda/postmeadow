/** Paid subscriptions: connecting Stripe, prices, checkout, webhooks, paid posts. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import Stripe from "stripe";
import {
  BASE,
  Client,
  createDraft,
  createOwner,
  linkIn,
  mail,
  resetDatabase,
  scalar,
  seedSubscribers,
  sql,
  waitForStatus,
} from "./helpers";

const SECRET = process.env.E2E_STRIPE_WEBHOOK_SECRET!;
const stripe = new Stripe("sk_test_unused"); // only for signing test webhooks
let seq = 0;

let owner: Client;
let publicationId: string;
const SLUG = "paid-pub";
const POST = "deep-dive";

async function sendStripeEvent(type: string, object: Record<string, unknown>) {
  const payload = JSON.stringify({
    id: `evt_paid_${++seq}_${Date.now()}`,
    type,
    created: Math.floor(Date.now() / 1000) + seq,
    object: "event",
    data: { object },
  });
  return fetch(`${BASE}/api/webhooks/stripe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }),
    },
    body: payload,
  });
}

const readerSub = (email: string, status: string, id = `sub_reader_${email}`) => ({
  id,
  object: "subscription",
  customer: `cus_${email.split("@")[0]}`,
  status,
  cancel_at_period_end: false,
  metadata: { kind: "reader", publicationId, email },
  items: {
    data: [
      {
        id: "si_1",
        price: { id: "price_m", lookup_key: null, recurring: { interval: "month" } },
        quantity: 1,
        current_period_end: 1_900_000_000,
      },
    ],
  },
});

const earn = (name: string, args: unknown[] = []) =>
  owner.action("/dashboard/monetize", "monetize/actions", name, args);

before(async () => {
  await resetDatabase();
  await mail.clear();
  ({ owner, publicationId } = await createOwner("writer@example.com", SLUG, "Paid Pub"));
  await seedSubscribers(publicationId, ["free@example.com"]);
});
after(() => sql.end());

describe("paid subscriptions", () => {
  test("the writer connects Stripe, sets prices and opens subscriptions", async () => {
    const connect = await earn("connectStripe");
    assert.match(connect.redirect ?? "", /^https:\/\//, JSON.stringify(connect));
    const account = await scalar(
      sql`select stripe_account_id from publications where id = ${publicationId}`,
    );
    assert.match(account, /^acct_/);

    // Can't open before Stripe says the account can take payments.
    assert.equal((await earn("setPaidEnabled", [true])).result.ok, false);
    assert.equal(
      (
        await earn("savePaidSettings", [
          { currency: "eur", monthly: "8", yearly: "80", description: "- Everything" },
        ])
      ).result.ok,
      true,
    );
    assert.equal(
      (
        await earn("savePaidSettings", [
          { currency: "eur", monthly: "abc", yearly: "", description: "" },
        ])
      ).result.ok,
      false,
    );
    // Stripe tells us the account is ready.
    const res = await sendStripeEvent("account.updated", {
      id: account,
      object: "account",
      charges_enabled: true,
    });
    assert.equal(res.status, 200);
    const opened = await earn("setPaidEnabled", [true]);
    assert.equal(opened.result.ok, true, JSON.stringify(opened.result));

    const upgrade = await new Client().page(`/${SLUG}/upgrade`);
    assert.match(upgrade, /€8 \/ month/);
    assert.match(upgrade, /€80 \/ year/);
    assert.match(upgrade, /Save 17%/);
    assert.match(await new Client().page(`/${SLUG}`), /Become a paid subscriber/);
  });

  test("a reader goes to Stripe Checkout", async () => {
    const r = await new Client().formAction(
      `/${SLUG}/upgrade`,
      "upgrade/actions",
      "startUpgrade",
      { email: "payer@example.com", interval: "year" },
      { leadingArgs: [SLUG], prev: { status: "idle" } },
    );
    assert.match(r.redirect ?? "", /^https:\/\/checkout\.stripe\.com\//, JSON.stringify(r));
  });

  test("the subscription webhook subscribes and marks them paid", async () => {
    const res = await sendStripeEvent(
      "customer.subscription.created",
      readerSub("payer@example.com", "active"),
    );
    assert.equal(res.status, 200);
    const row =
      await sql`select status, paid_status, paid_interval, source from subscribers where email = 'payer@example.com'`;
    assert.deepEqual(
      { ...row[0] },
      { status: "active", paid_status: "active", paid_interval: "month", source: "paid" },
    );
    // A free subscriber who pays keeps their row and becomes paid.
    await sendStripeEvent("customer.subscription.created", readerSub("free@example.com", "active"));
    await sendStripeEvent(
      "customer.subscription.deleted",
      readerSub("free@example.com", "canceled"),
    );
    assert.equal(
      await scalar(sql`select paid_status from subscribers where email = 'free@example.com'`),
      "canceled",
    );
    assert.match(await owner.page("/dashboard/subscribers?status=paid"), /payer@example.com/);
    assert.doesNotMatch(await owner.page("/dashboard/subscribers?status=paid"), /free@example.com/);
    assert.match(await owner.page("/dashboard/monetize"), /Paid subscribers/);
  });

  test("a paid post: payers get it all, free readers a preview with an upgrade button", async () => {
    const content = [
      "Intro one.",
      "Intro two.",
      "Intro three.",
      "Secret four.",
      "Secret five.",
      "Secret six.",
      "Secret seven.",
      "Secret eight.",
      "Secret nine.",
    ].join("\n\n");
    const postId = await createDraft(owner, "Deep dive", POST, content);
    assert.equal(
      (
        await owner.action(`/dashboard/posts/${postId}`, "posts/actions", "setPostPaid", [
          postId,
          true,
        ])
      ).result.ok,
      true,
    );
    await mail.clear();
    await owner.action(`/dashboard/posts/${postId}`, "posts/actions", "sendPost", [postId, null]);
    await waitForStatus(postId, "sent");
    const paidMail = await mail.waitFor("payer@example.com", "Deep dive");
    assert.match(paidMail.Text, /Secret nine\./);
    const freeMail = await mail.waitFor("free@example.com", "Deep dive");
    assert.match(freeMail.Text, /Intro three\./);
    assert.doesNotMatch(freeMail.Text, /Secret/);
    assert.match(freeMail.HTML, /Upgrade to read the rest/);

    // On the web: a preview and the paywall, and the feed has only the preview.
    const web = await new Client().page(`/${SLUG}/p/${POST}`);
    assert.match(web, /Intro three\./);
    assert.doesNotMatch(web, /Secret/);
    assert.match(web, /This post is for paid subscribers/);
    const feed = await (await fetch(`${BASE}/${SLUG}/feed.xml`)).text();
    assert.doesNotMatch(feed, /Secret/);
  });

  test("paying readers unlock the web version with an emailed link", async () => {
    const reader = new Client();
    await mail.clear();
    const r = await reader.formAction(
      `/${SLUG}/p/${POST}`,
      "upgrade/actions",
      "sendPaidLoginLink",
      { email: "payer@example.com" },
      { leadingArgs: [SLUG, `/${SLUG}/p/${POST}`], prev: { status: "idle" } },
    );
    assert.equal(r.result.status, "sent");
    const email = await mail.waitFor("payer@example.com", "Your link to read");
    const res = await reader.fetch(linkIn(email, `/${SLUG}/access`));
    assert.equal(res.status, 303);
    assert.match(await reader.page(`/${SLUG}/p/${POST}`), /Secret nine\./);

    // Free readers asking get the same answer, but no email.
    await mail.clear();
    const free = await new Client().formAction(
      `/${SLUG}/p/${POST}`,
      "upgrade/actions",
      "sendPaidLoginLink",
      { email: "free@example.com" },
      { leadingArgs: [SLUG, `/${SLUG}/p/${POST}`], prev: { status: "idle" } },
    );
    assert.equal(free.result.status, "sent");
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(await mail.countTo("free@example.com"), 0);

    // Cancelled: the cookie stops working.
    await sendStripeEvent(
      "customer.subscription.deleted",
      readerSub("payer@example.com", "canceled"),
    );
    assert.doesNotMatch(await reader.page(`/${SLUG}/p/${POST}`), /Secret nine\./);
  });

  test("editors and contributors can't reach the money", async () => {
    assert.match(await owner.page("/dashboard/monetize"), /Connect Stripe|Connected/);
  });
});
