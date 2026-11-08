/** Resend webhooks: signatures, bounces, complaints, suppressions, retries. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import {
  BASE,
  Client,
  createDraft,
  createOwner,
  mail,
  resetDatabase,
  scalar,
  seedSubscribers,
  sendResendEvent,
  sql,
  waitForStatus,
} from "./helpers";

let owner: Client;
let publicationId: string;
let postId: string;

/** The provider message id stored for this recipient's delivery of the post. */
const messageIdFor = (email: string) =>
  scalar(sql`select d.provider_message_id from deliveries d
    join subscribers s on s.id = d.subscriber_id
    where d.post_id = ${postId} and s.email = ${email}`);

const subscriber = async (email: string) =>
  (await sql`select status, status_reason from subscribers where email = ${email}`)[0];

const delivery = async (email: string) =>
  (
    await sql`select d.status, d.error from deliveries d join subscribers s on s.id = d.subscriber_id
    where d.post_id = ${postId} and s.email = ${email}`
  )[0];

const bounce = (email_id: string, to: string, type = "Permanent") => ({
  type: "email.bounced",
  data: {
    email_id,
    to: [to],
    bounce: {
      type,
      subType: type === "Permanent" ? "General" : "MailboxFull",
      message: "Mailbox does not exist",
    },
  },
});

before(async () => {
  await resetDatabase();
  ({ owner, publicationId } = await createOwner("hooks@example.com", "hooks-pub"));
  await seedSubscribers(publicationId, [
    "hard@example.com",
    "soft@example.com",
    "spam@example.com",
    "fine@example.com",
    "suppressed@example.com",
  ]);
  postId = await createDraft(owner, "Webhook issue", "webhook-issue");
  await mail.clear();
  await owner.action(`/dashboard/posts/${postId}`, "posts/actions", "sendPost", [postId]);
  await waitForStatus(postId, "sent");
});
after(() => sql.end());

describe("signature checks", () => {
  test("missing signature headers → 400", async () => {
    const res = await fetch(`${BASE}/api/webhooks/resend`, { method: "POST", body: "{}" });
    assert.equal(res.status, 400);
  });

  test("wrong secret → 401, nothing changes", async () => {
    const res = await sendResendEvent(
      bounce(await messageIdFor("fine@example.com"), "fine@example.com"),
      {
        secret: "whsec_" + Buffer.from("not-the-real-secret-0123456789ab").toString("base64"),
      },
    );
    assert.equal(res.status, 401);
    assert.equal((await subscriber("fine@example.com")).status, "active");
  });
});

describe("events", () => {
  test("hard bounce marks the delivery and the subscriber as bounced", async () => {
    const res = await sendResendEvent(
      bounce(await messageIdFor("hard@example.com"), "hard@example.com"),
    );
    assert.equal(res.status, 200);
    assert.equal((await delivery("hard@example.com")).status, "bounced");
    const s = await subscriber("hard@example.com");
    assert.equal(s.status, "bounced");
    assert.match(s.status_reason, /Hard bounce/);
  });

  test("soft bounce keeps the subscriber active and notes it on the delivery", async () => {
    await sendResendEvent(
      bounce(await messageIdFor("soft@example.com"), "soft@example.com", "Transient"),
    );
    assert.equal((await subscriber("soft@example.com")).status, "active");
    const d = await delivery("soft@example.com");
    assert.equal(d.status, "sent");
    assert.match(d.error, /Soft bounce/);
  });

  test("spam complaint unsubscribes", async () => {
    await sendResendEvent({
      type: "email.complained",
      data: { email_id: await messageIdFor("spam@example.com"), to: ["spam@example.com"] },
    });
    assert.equal((await delivery("spam@example.com")).status, "complained");
    const s = await subscriber("spam@example.com");
    assert.equal(s.status, "unsubscribed");
    assert.equal(s.status_reason, "Marked as spam");
  });

  test("suppression counts as a hard bounce", async () => {
    await sendResendEvent({
      type: "email.suppressed",
      data: {
        email_id: await messageIdFor("suppressed@example.com"),
        to: ["suppressed@example.com"],
        suppressed: { type: "OnAccountSuppressionList", message: "Previously bounced" },
      },
    });
    assert.equal((await subscriber("suppressed@example.com")).status, "bounced");
  });

  test("a bounced confirmation email marks the pending sign-up as bounced", async () => {
    await sql`insert into subscribers (publication_id, email, status, unsubscribe_token, confirm_token)
      values (${publicationId}, 'typo@exampel.com', 'pending', ${"t_" + crypto.randomUUID()}, 'ct')`;
    await sendResendEvent(bounce("not-a-newsletter-email", "Typo@Exampel.com"));
    assert.equal((await subscriber("typo@exampel.com")).status, "bounced");
  });

  test("the same event delivered twice is processed once", async () => {
    const id = `msg_${crypto.randomUUID()}`;
    const event = bounce(await messageIdFor("fine@example.com"), "fine@example.com", "Transient");
    const first = await (await sendResendEvent(event, { id })).json();
    const second = await (await sendResendEvent(event, { id })).json();
    assert.equal(first.duplicate, undefined);
    assert.equal(second.duplicate, true);
  });

  test("unrelated event types are accepted and ignored", async () => {
    const res = await sendResendEvent({ type: "email.opened", data: { email_id: "x", to: [] } });
    assert.equal((await res.json()).result, "ignored");
  });
});

test("the next send skips bounced and complaining subscribers", async () => {
  const next = await createDraft(owner, "Next issue", "next-issue");
  await mail.clear();
  await owner.action(`/dashboard/posts/${next}`, "posts/actions", "sendPost", [next]);
  await waitForStatus(next, "sent");
  const recipients = (await mail.list()).flatMap((m) => m.To.map((t) => t.Address)).sort();
  assert.deepEqual(recipients, ["fine@example.com", "soft@example.com"]);
});

test("post page and subscriber list show what happened", async () => {
  const post = await owner.page(`/dashboard/posts/${postId}`);
  assert.match(post, /Bounced/);
  assert.match(post, /Marked as spam/);
  const list = await owner.page("/dashboard/subscribers?status=bounced");
  assert.match(list, /Hard bounce/);
});
