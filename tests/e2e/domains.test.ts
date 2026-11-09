/** Publications on their own domains, and sending from the writer's own address. */
import assert from "node:assert/strict";
import { request } from "node:http";
import { after, before, describe, test } from "node:test";
import {
  BASE,
  Client,
  createDraft,
  createOwner,
  mail,
  resetDatabase,
  seedSubscribers,
  sql,
  waitForStatus,
} from "./helpers";

let owner: Client;
let publicationId: string;
const SLUG = "brand-pub";
const DOMAIN = "news.brand.test";

before(async () => {
  await resetDatabase();
  await mail.clear();
  ({ owner, publicationId } = await createOwner("brand@example.com", SLUG, "Brand News"));
  await seedSubscribers(publicationId, ["fan@example.com"]);
});
after(() => sql.end());

const act = (name: string, args: unknown[] = []) =>
  owner.action("/dashboard/settings", "settings/domain-actions", name, args);

/** A request to the test server as if it were for another host name. */
function asHost(
  host: string,
  path: string,
): Promise<{ status: number; location: string; body: string }> {
  const url = new URL(path, BASE);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: { host },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            location: String(res.headers.location ?? ""),
            body,
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("custom domains", () => {
  test("need a paid plan", async () => {
    const r = await act("setCustomDomain", [DOMAIN]);
    assert.equal(r.result.ok, false);
    assert.match(r.result.error, /Pro and Business/);
    await sql`insert into account_billing (user_id, plan) select owner_id, 'pro' from publications where id = ${publicationId}`;
  });

  test("bad domains are refused; the app's own host too", async () => {
    assert.equal((await act("setCustomDomain", ["not a domain"])).result.ok, false);
    assert.equal((await act("setCustomDomain", [new URL(BASE).hostname])).result.ok, false);
  });

  test("once verified, the publication is served on its domain", async () => {
    // Before verifying: nothing special happens there, and no certificate is allowed.
    assert.equal(
      (await act("setCustomDomain", [`https://${DOMAIN.toUpperCase()}/x`])).result.ok,
      true,
    );
    assert.equal((await fetch(`${BASE}/api/domains/check?domain=${DOMAIN}`)).status, 404);

    const verified = await act("verifyCustomDomain");
    assert.equal(verified.result.ok, true, JSON.stringify(verified.result));
    assert.equal((await fetch(`${BASE}/api/domains/check?domain=${DOMAIN}`)).status, 200);
    assert.equal((await fetch(`${BASE}/api/domains/check?domain=other.test`)).status, 404);

    const postId = await createDraft(
      owner,
      "On our domain",
      "on-our-domain",
      "Hello from the domain.",
    );
    await mail.clear();
    await owner.action(`/dashboard/posts/${postId}`, "posts/actions", "sendPost", [postId, null]);
    await waitForStatus(postId, "sent");

    const home = await asHost(DOMAIN, "/");
    assert.equal(home.status, 200);
    assert.match(home.body, /Brand News/);
    const post = await asHost(DOMAIN, "/p/on-our-domain");
    assert.equal(post.status, 200);
    assert.match(post.body, /Hello from the domain\./);
    // Old-style links lose the slug; app pages go to the app.
    const old = await asHost(DOMAIN, `/${SLUG}/p/on-our-domain`);
    assert.equal(old.status, 308);
    assert.match(old.location, /^(https?:\/\/[^/]+)?\/p\/on-our-domain$/);
    const dash = await asHost(DOMAIN, "/dashboard");
    assert.ok(dash.status >= 300 && dash.status < 400);
    assert.match(dash.location, /\/dashboard$/);
    assert.doesNotMatch(dash.location, new RegExp(DOMAIN));
    // Shared routes still work there.
    assert.equal((await asHost(DOMAIN, "/api/health")).status, 200);

    // Emails link to the domain.
    const email = await mail.waitFor("fan@example.com", "On our domain");
    assert.match(email.Text, new RegExp(`https://${DOMAIN.replace(/\./g, "\\.")}/p/on-our-domain`));
  });

  test("a domain belongs to one publication", async () => {
    const other = await createOwner("other@example.com", "other-pub");
    await sql`insert into account_billing (user_id, plan) select owner_id, 'pro' from publications where id = ${other.publicationId}`;
    const r = await other.owner.action(
      "/dashboard/settings",
      "settings/domain-actions",
      "setCustomDomain",
      [DOMAIN],
    );
    assert.equal(r.result.ok, false);
    assert.match(r.result.error, /already uses/);
  });
});

describe("sending address", () => {
  test("free-mail addresses are refused", async () => {
    assert.equal((await act("setSenderEmail", ["me@gmail.com"])).result.ok, false);
  });

  test("after the DNS records verify, issues come from the writer's address", async () => {
    const set = await act("setSenderEmail", ["hello@brand.test"]);
    assert.equal(set.result.ok, true, JSON.stringify(set.result));
    const settings = await owner.page("/dashboard/settings");
    assert.match(settings, /resend\._domainkey\.brand\.test/);

    // Not yet verified: still our address.
    let postId = await createDraft(owner, "Before verifying", "before-verifying");
    await mail.clear();
    await owner.action(`/dashboard/posts/${postId}`, "posts/actions", "sendPost", [postId, null]);
    await waitForStatus(postId, "sent");
    let email = await mail.waitFor("fan@example.com", "Before verifying");
    assert.notEqual(email.From.Address, "hello@brand.test");

    const checked = await act("checkSenderDomain");
    assert.equal(checked.result.ok, true, JSON.stringify(checked.result));
    postId = await createDraft(owner, "After verifying", "after-verifying");
    await mail.clear();
    await owner.action(`/dashboard/posts/${postId}`, "posts/actions", "sendPost", [postId, null]);
    await waitForStatus(postId, "sent");
    email = await mail.waitFor("fan@example.com", "After verifying");
    assert.equal(email.From.Address, "hello@brand.test");
    assert.equal(email.From.Name, "Brand News");

    assert.equal((await act("removeSenderDomain")).result.ok, true);
  });
});
