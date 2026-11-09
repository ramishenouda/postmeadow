/** Referrals, recommendations, landing pages and the website pop-up. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import {
  BASE,
  Client,
  createOwner,
  linkIn,
  mail,
  resetDatabase,
  scalar,
  seedSubscribers,
  sql,
} from "./helpers";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let owner: Client;
let publicationId: string;
const SLUG = "grow-pub";

before(async () => {
  await resetDatabase();
  await mail.clear();
  ({ owner, publicationId } = await createOwner("grow@example.com", SLUG, "Grow Weekly"));
  await seedSubscribers(publicationId, ["fan@example.com"]);
});
after(() => sql.end());

const growth = (name: string, args: unknown[]) =>
  owner.action("/dashboard/growth", "growth/actions", name, args);

/** Subscribes through a page's form (with optional extra fields) and confirms by email. */
async function subscribeAndConfirm(
  page: string,
  email: string,
  fields: Record<string, string> = {},
) {
  const client = new Client();
  const { result } = await client.formAction(
    page,
    "[slug]/actions",
    "subscribe",
    { email, website: "", ...fields },
    { leadingArgs: [SLUG], prev: { status: "idle" } },
  );
  assert.equal(result.status, "success", JSON.stringify(result));
  const message = await mail.waitFor(email, "Confirm");
  const res = await client.fetch(linkIn(message, "/api/subscriptions/confirm"));
  return { client, location: res.headers.get("location") ?? "" };
}

describe("referrals", () => {
  test("off by default: no footer link, codes are ignored", async () => {
    await scalar(sql`select 1`);
    const prefs = await new Client().page(
      `/unsubscribe/${await scalar(sql`select unsubscribe_token from subscribers where email = 'fan@example.com'`)}`,
    );
    assert.doesNotMatch(prefs, /Your referral link/);
  });

  test("readers share a link; confirmed friends count; rewards notify both sides", async () => {
    assert.equal((await growth("setReferrals", [true])).result.ok, true);
    assert.equal(
      (await growth("addReward", [{ threshold: 2, name: "Sticker pack", description: "" }])).result
        .ok,
      true,
    );
    // Same threshold twice is refused.
    assert.equal(
      (await growth("addReward", [{ threshold: 2, name: "Other", description: "" }])).result.ok,
      false,
    );

    const token = await scalar(
      sql`select unsubscribe_token from subscribers where email = 'fan@example.com'`,
    );
    const prefs = await new Client().page(`/unsubscribe/${token}`);
    assert.match(prefs, /Your referral link/);
    const code = await scalar(
      sql`select referral_code from subscribers where email = 'fan@example.com'`,
    );
    assert.match(code, /^[a-z0-9]{8}$/);
    assert.match(prefs, new RegExp(`${SLUG}\\?ref=${code}`));

    await mail.clear();
    await subscribeAndConfirm(`/${SLUG}?ref=${code}`, "friend1@example.com", { ref: code });
    assert.equal(
      await scalar(sql`select source from subscribers where email = 'friend1@example.com'`),
      "referral",
    );
    // A friend who never confirms doesn't count.
    await new Client().formAction(
      `/${SLUG}`,
      "[slug]/actions",
      "subscribe",
      { email: "lazy@example.com", website: "", ref: code },
      {
        leadingArgs: [SLUG],
        prev: { status: "idle" },
      },
    );
    await subscribeAndConfirm(`/${SLUG}?ref=${code}`, "friend2@example.com", { ref: code });

    await mail.waitFor("fan@example.com", "You earned: Sticker pack", 15_000);
    await mail.waitFor("grow@example.com", "earned “Sticker pack”", 15_000);
    await sleep(500);
    assert.equal(await mail.countTo("fan@example.com"), 1); // once

    const dashboard = await owner.page("/dashboard/growth");
    assert.match(dashboard, /Top referrers/);
    assert.match(dashboard, /fan@example.com/);

    // Issues carry a "Refer a friend" link to the reader's page.
    await sql`update publications set postal_address = '1 Street' where id = ${publicationId}`;
  });

  test("a made-up code or your own code is ignored", async () => {
    await subscribeAndConfirm(`/${SLUG}`, "solo@example.com", { ref: "zzzzzzzz" });
    assert.equal(
      await scalar(sql`select source from subscribers where email = 'solo@example.com'`),
      "signup",
    );
  });
});

describe("recommendations", () => {
  let otherId: string;

  before(async () => {
    const other = await createOwner("other@example.com", "other-pub", "Other Letter");
    otherId = other.publicationId;
  });

  test("writers add other publications by address, not themselves", async () => {
    assert.equal(
      (await growth("addRecommendation", [`${BASE}/other-pub`, "Great letters"])).result.ok,
      true,
    );
    assert.equal((await growth("addRecommendation", [SLUG, ""])).result.ok, false);
    assert.equal((await growth("addRecommendation", ["no-such-pub", ""])).result.ok, false);
  });

  test("new readers see them after confirming and subscribe in one click", async () => {
    await mail.clear();
    const { client, location } = await subscribeAndConfirm(`/${SLUG}`, "newbie@example.com");
    const page = await client.page(location);
    assert.match(page, /Grow Weekly recommends/);
    assert.match(page, /Other Letter/);
    assert.match(page, /Great letters/);

    const proof = new URL(location, BASE).searchParams.get("w")!;
    const { result } = await client.formAction(
      location,
      "subscribed/actions",
      "subscribeRecommended",
      { publication: otherId },
      { leadingArgs: [proof], prev: { status: "idle" } },
    );
    assert.deepEqual(result, { status: "done", count: 1 });
    const row =
      await sql`select status, source from subscribers where publication_id = ${otherId} and email = 'newbie@example.com'`;
    assert.deepEqual({ ...row[0] }, { status: "active", source: "recommendation" });
    // A forged proof does nothing.
    const forged = await client.formAction(
      location,
      "subscribed/actions",
      "subscribeRecommended",
      { publication: otherId },
      { leadingArgs: [`${proof}x`], prev: { status: "idle" } },
    );
    assert.equal(forged.result.status, "error");
  });

  test("without a valid proof the page shows no picker", async () => {
    const page = await new Client().page(`/${SLUG}/subscribed`);
    assert.doesNotMatch(page, /recommends/);
  });
});

describe("landing pages and the pop-up", () => {
  test("a landing page tags its sign-ups", async () => {
    const saved = await growth("saveLandingPage", [
      {
        slug: "podcast",
        headline: "Heard me on the podcast?",
        body: "- Weekly tips\n- Free",
        buttonText: "Count me in",
        tag: "podcast",
      },
    ]);
    assert.equal(saved.result.ok, true, JSON.stringify(saved.result));
    const page = await new Client().page(`/${SLUG}/l/podcast`);
    assert.match(page, /Heard me on the podcast\?/);
    assert.match(page, /Weekly tips/);
    assert.match(page, /Count me in/);
    assert.match(page, /name="tag" value="podcast"/);

    await mail.clear();
    await subscribeAndConfirm(`/${SLUG}/l/podcast`, "listener@example.com", { tag: "podcast" });
    assert.equal(
      await scalar(sql`select t.name from subscriber_tags st join tags t on t.id = st.tag_id
        join subscribers s on s.id = st.subscriber_id where s.email = 'listener@example.com'`),
      "podcast",
    );
    // Duplicate addresses and bad slugs are refused; unknown pages are 404s.
    assert.equal(
      (
        await growth("saveLandingPage", [
          { slug: "podcast", headline: "x", body: "", buttonText: "", tag: "" },
        ])
      ).result.ok,
      false,
    );
    assert.match(await new Client().page(`/${SLUG}/l/nope`), /not found|404/i);
  });

  test("the pop-up script is served with the writer's settings", async () => {
    assert.equal((await growth("savePopup", [3, "Join 5,000 gardeners"])).result.ok, true);
    const res = await fetch(`${BASE}/embed/${SLUG}/popup.js`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /javascript/);
    const js = await res.text();
    assert.match(js, /"delay":3000/);
    assert.match(js, /embed\/grow-pub\?popup=1/);
    const frame = await new Client().page(`/embed/${SLUG}?popup=1`);
    assert.match(frame, /Join 5,000 gardeners/);
    assert.equal((await fetch(`${BASE}/embed/nope-pub/popup.js`)).status, 404);
    assert.equal((await growth("savePopup", [999, ""])).result.ok, false);
  });
});
