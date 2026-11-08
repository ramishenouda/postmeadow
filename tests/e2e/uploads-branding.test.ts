/** Image uploads, storage quotas, the media route and publication branding. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import sharp from "sharp";
import {
  BASE,
  Client,
  createDraft,
  createOwner,
  mail,
  resetDatabase,
  scalar,
  seedSubscribers,
  sql,
  waitForStatus,
} from "./helpers";

let owner: Client;
let ownerId: string;
let publicationId: string;

const png = (width = 64, height = 32) =>
  sharp({ create: { width, height, channels: 3, background: { r: 30, g: 90, b: 200 } } })
    .png()
    .toBuffer();

async function upload(client: Client, body: Blob, name = "image.png") {
  const form = new FormData();
  form.append("file", body, name);
  const res = await client.fetch("/api/uploads", { method: "POST", body: form });
  return { status: res.status, json: await res.json() };
}

const imageBlob = async (w?: number, h?: number) =>
  new Blob([new Uint8Array(await png(w, h))], { type: "image/png" });

before(async () => {
  await resetDatabase();
  ({ owner, publicationId } = await createOwner("brand@example.com", "brand-pub", "Brand Pub"));
  ownerId = await scalar(sql`select id from "user" where email = 'brand@example.com'`);
});
after(() => sql.end());

describe("uploads", () => {
  test("signed-out uploads are refused", async () => {
    const { status } = await upload(new Client(), await imageBlob());
    assert.equal(status, 401);
  });

  test("non-images are refused", async () => {
    const { status, json } = await upload(
      owner,
      new Blob(["just text"], { type: "image/png" }),
      "fake.png",
    );
    assert.equal(status, 415);
    assert.match(json.error, /image/i);
  });

  test("oversized uploads are refused before processing", async () => {
    const { status } = await upload(owner, new Blob([new Uint8Array(11 * 1024 * 1024)]), "big.png");
    assert.equal(status, 413);
  });

  test("an image uploads, is resized, and is served with long caching", async () => {
    const { status, json } = await upload(owner, await imageBlob(2400, 1200), "Team photo.png");
    assert.equal(status, 201);
    assert.match(json.url, new RegExp(`^${BASE}/media/images/[0-9a-f-]{36}\\.png$`));
    assert.deepEqual([json.width, json.height], [1600, 800]);

    const res = await fetch(json.url);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/png");
    assert.match(res.headers.get("cache-control") ?? "", /immutable/);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal((await res.arrayBuffer()).byteLength, json.bytes);
    assert.equal(
      await scalar(sql`select original_name from images where id = ${json.id}`),
      "Team photo.png",
    );
  });

  test("the media route only serves well-formed keys", async () => {
    for (const path of [
      "/media/images/not-a-uuid.png",
      "/media/..%2F..%2Fpackage.json",
      `/media/images/${crypto.randomUUID()}.svg`,
      `/media/images/${crypto.randomUUID()}.png`, // well-formed but missing
    ]) {
      assert.equal((await fetch(BASE + path)).status, 404, path);
    }
  });

  test("uploads beyond the plan's storage are refused with a clear message", async () => {
    // Fill the free plan (500 MB) to within a few bytes.
    await sql`insert into images (owner_id, key, content_type, bytes, width, height)
      values (${ownerId}, ${`images/${crypto.randomUUID()}.png`}, 'image/png',
              ${500 * 1024 * 1024 - 10}, 1, 1)`;
    const { status, json } = await upload(owner, await imageBlob());
    assert.equal(status, 413);
    assert.match(json.error, /Not enough storage/);
    assert.match(json.error, /Free plan/);

    // A paid plan with more room lets the same upload through.
    await sql`insert into account_billing (user_id, plan) values (${ownerId}, 'pro')`;
    assert.equal((await upload(owner, await imageBlob())).status, 201);
    await sql`delete from images where bytes > 400000000`;
    await sql`delete from account_billing where user_id = ${ownerId}`;
  });

  test("settings show storage usage", async () => {
    const html = (await owner.page("/dashboard/settings")).replaceAll("<!-- -->", "");
    assert.match(html, /Free plan · [\d.]+ KB of 500 MB used/);
  });
});

describe("deleting uploads", () => {
  test("unused images can be deleted; the file goes too", async () => {
    const { json } = await upload(owner, await imageBlob(), "unused.png");
    const { result } = await owner.action(
      "/dashboard/settings",
      "settings/actions",
      "deleteUploadedImage",
      [json.id],
    );
    assert.equal(result.ok, true);
    assert.equal(await scalar(sql`select count(*) from images where id = ${json.id}`), "0");
    assert.equal((await fetch(json.url)).status, 404);
  });

  test("images in a sent email can't be deleted", async () => {
    const { json } = await upload(owner, await imageBlob(), "sent.png");
    await seedSubscribers(publicationId, ["reader@example.com"]);
    const postId = await createDraft(
      owner,
      "With image",
      "with-image",
      `Hello\n\n![](${json.url})`,
    );
    await owner.action(`/dashboard/posts/${postId}`, "posts/actions", "sendPost", [postId]);
    await waitForStatus(postId, "sent");

    const { result } = await owner.action(
      "/dashboard/settings",
      "settings/actions",
      "deleteUploadedImage",
      [json.id],
    );
    assert.equal(result.ok, false);
    assert.match(result.error, /sent/);
    assert.equal((await fetch(json.url)).status, 200);
  });

  test("another account can't delete someone else's image", async () => {
    const { json } = await upload(owner, await imageBlob(), "mine.png");
    const { owner: other } = await createOwner("other-brand@example.com", "other-brand");
    const { result } = await other.action(
      "/dashboard/settings",
      "settings/actions",
      "deleteUploadedImage",
      [json.id],
    );
    assert.equal(result.ok, false);
    assert.equal(await scalar(sql`select count(*) from images where id = ${json.id}`), "1");
  });
});

describe("branding", () => {
  const save = (fields: Record<string, string>, client = owner) =>
    client.formAction("/dashboard/settings", "settings/actions", "updateSettings", {
      name: "Brand Pub",
      description: "",
      fromName: "Brand Pub",
      replyTo: "",
      logoUrl: "",
      accentColor: "",
      fontStyle: "sans",
      ...fields,
    });

  test("unreadable accent colours are refused", async () => {
    const { result } = await save({ accentColor: "#fde047" });
    assert.match(result.errors.accentColor, /Too light/);
  });

  test("logos must be the account's own uploads", async () => {
    const external = await save({ logoUrl: "https://evil.example.com/logo.png" });
    assert.match(external.result.errors.logoUrl, /Upload the logo here/);

    const { json } = await upload(owner, await imageBlob(), "theirs.png");
    const { owner: other } = await createOwner("thief@example.com", "thief-pub");
    const stolen = await save({ logoUrl: json.url }, other);
    assert.match(stolen.result.errors.logoUrl, /Upload the logo here/);
  });

  let logoUrl: string;

  test("logo, accent and font are saved", async () => {
    logoUrl = (await upload(owner, await imageBlob(300, 80), "logo.png")).json.url;
    const { result } = await save({ logoUrl, accentColor: "#B91C1C", fontStyle: "serif" });
    assert.equal(result.ok, true, JSON.stringify(result));
    const [row] =
      await sql`select logo_url, accent_color, font_style from publications where id = ${publicationId}`;
    assert.deepEqual(row, { logo_url: logoUrl, accent_color: "#b91c1c", font_style: "serif" });
  });

  test("the public page uses the brand", async () => {
    const html = await new Client().page("/brand-pub");
    assert.ok(html.includes(logoUrl), "logo missing");
    assert.match(html, /--accent:#b91c1c/);
    assert.match(html, /font-serif/);
  });

  test("emails use the brand", async () => {
    const postId = await createDraft(owner, "Branded", "branded", "A [link](https://example.com).");
    await mail.clear();
    await owner.action(`/dashboard/posts/${postId}`, "posts/actions", "sendTest", [postId]);
    const message = await mail.waitFor("brand@example.com", "[Test]");
    assert.ok(message.HTML.includes(logoUrl), "logo missing from email");
    assert.match(message.HTML, /href="https:\/\/example.com"[^>]*color:#b91c1c/);
    assert.match(message.HTML, /Georgia/);
  });

  test("the logo counts as in use, so it can't be deleted", async () => {
    const id = await scalar(sql`select id from images where ${logoUrl} like '%' || key`);
    const { result } = await owner.action(
      "/dashboard/settings",
      "settings/actions",
      "deleteUploadedImage",
      [id],
    );
    assert.equal(result.ok, false);
  });
});
