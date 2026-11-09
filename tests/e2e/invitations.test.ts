/** Writers invite people; people accept or decline; unanswered invitations expire. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import {
  Client,
  createOwner,
  linkIn,
  mail,
  resetDatabase,
  scalar,
  sql,
  type Message,
} from "./helpers";

let owner: Client;
let publicationId: string;
const SLUG = "invites-pub";

before(async () => {
  await resetDatabase();
  ({ owner, publicationId } = await createOwner("inviter@example.com", SLUG, "Invite Notes"));
});
after(() => sql.end());

const invite = (email: string) =>
  owner.formAction("/dashboard/subscribers", "subscribers/actions", "addSubscriber", { email });

const answer = (token: string, choice: "accept" | "decline") =>
  new Client().action(`/invite/${token}`, "invite/[token]/actions", "respondToInvitation", [
    token,
    choice,
  ]);

const row = async (email: string) =>
  (
    await sql`select status, invited_at, invite_count from subscribers
      where publication_id = ${publicationId} and email = ${email}`
  )[0];

/** Pretend the invitation went out 8 days ago. */
const expire = (email: string) =>
  sql`update subscribers set confirm_sent_at = now() - interval '8 days', invited_at = now() - interval '8 days'
    where publication_id = ${publicationId} and email = ${email}`;

async function invitationFor(email: string): Promise<{ message: Message; token: string }> {
  const message = await mail.waitFor(email, "invited");
  const url = linkIn(message, "/invite/");
  return { message, token: new URL(url).pathname.split("/").pop()! };
}

describe("inviting one person", () => {
  test("adding someone sends an invitation instead of subscribing them", async () => {
    await mail.clear();
    const { result } = await invite("ada@example.com");
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal((await row("ada@example.com")).status, "pending");

    const { message } = await invitationFor("ada@example.com");
    // The sender name is the publication's name here, so it isn't repeated.
    assert.match(message.Subject, /You're invited to subscribe to Invite Notes/);
    assert.match(message.From.Name, /Invite Notes/);
    // Both answers go through the page; nothing in the email answers by itself.
    assert.doesNotMatch(message.HTML, /respond|accept=|decline=/);

    const list = await owner.page("/dashboard/subscribers");
    assert.match(list, /ada@example.com/);
    assert.match(list, />invited</i);
    assert.match(list, /Expires/);
  });

  test("opening the invitation page doesn't answer it", async () => {
    const { token } = await invitationFor("ada@example.com");
    const page = await new Client().page(`/invite/${token}`);
    assert.match(page, /Subscribe to Invite Notes\?/);
    assert.match(page, /noindex/);
    assert.equal((await row("ada@example.com")).status, "pending");
    // "No thanks" in the email opens the same page, asking to confirm.
    assert.match(await new Client().page(`/invite/${token}?answer=no`), /Don(&#x27;|')t want/);
  });

  test("accepting subscribes them and sends the welcome email", async () => {
    const { token } = await invitationFor("ada@example.com");
    const { redirect } = await answer(token, "accept");
    assert.match(redirect ?? "", new RegExp(`/invite/${token}`));
    assert.equal((await row("ada@example.com")).status, "active");
    await mail.waitFor("ada@example.com", "Welcome");
    assert.match(await new Client().page(`/invite/${token}`), /You(&#x27;|')re subscribed/);
    // Answering twice changes nothing.
    await answer(token, "decline");
    assert.equal((await row("ada@example.com")).status, "active");
  });

  test("declining is final: the writer can't invite them again", async () => {
    await invite("bea@example.com");
    const { token } = await invitationFor("bea@example.com");
    await answer(token, "decline");
    assert.equal((await row("bea@example.com")).status, "declined");
    assert.match(await new Client().page(`/invite/${token}`), /can(&#x27;|')t invite you again/);

    const again = await invite("bea@example.com");
    assert.match(again.result.error, /declined/);
    assert.match(await owner.page("/dashboard/subscribers?status=declined"), /bea@example.com/);

    // …and the record can't be removed to get around that.
    const id = await scalar(sql`select id from subscribers where email = 'bea@example.com'`);
    await owner.action("/dashboard/subscribers", "subscribers/actions", "removeSubscriber", [id]);
    assert.equal((await row("bea@example.com")).status, "declined");
  });

  test("someone who declined can still subscribe themselves", async () => {
    await mail.clear();
    const res = await new Client().fetch(`/api/subscribe/${SLUG}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: "bea@example.com", website: "" }),
    });
    assert.ok(res.status < 400, `subscribe returned ${res.status}`);
    const r = await row("bea@example.com");
    assert.equal(r.status, "pending");
    assert.equal(r.invited_at, null);
  });
});

describe("expired invitations", () => {
  test("an unanswered invitation shows as expired and can't be accepted", async () => {
    await mail.clear();
    await invite("cy@example.com");
    const { token } = await invitationFor("cy@example.com");
    await expire("cy@example.com");

    const list = await owner.page("/dashboard/subscribers?status=expired");
    assert.match(list, /cy@example.com/);
    assert.match(list, />expired</i);
    assert.match(list, /Invitation expired/);
    assert.match(list, /Invite again/);
    // Not counted as waiting for an answer.
    assert.doesNotMatch(await owner.page("/dashboard/subscribers?status=waiting"), /cy@example/);

    assert.match(await new Client().page(`/invite/${token}`), /This invitation has expired/);
    await answer(token, "accept");
    assert.equal((await row("cy@example.com")).status, "pending");
  });

  test("an expired invitation can be sent once more, then no more", async () => {
    await mail.clear();
    const id = await scalar(sql`select id from subscribers where email = 'cy@example.com'`);
    const first = await owner.action(
      "/dashboard/subscribers",
      "subscribers/actions",
      "inviteAgain",
      [id],
    );
    assert.equal(first.result.ok, true, JSON.stringify(first.result));
    assert.equal((await row("cy@example.com")).invite_count, 2);
    const { token } = await invitationFor("cy@example.com");
    assert.match(await new Client().page(`/invite/${token}`), /Subscribe to Invite Notes\?/);

    await expire("cy@example.com");
    const second = await owner.action(
      "/dashboard/subscribers",
      "subscribers/actions",
      "inviteAgain",
      [id],
    );
    assert.equal(second.result.ok, false);
    assert.match(second.result.error, /invited 2 times/);
    assert.doesNotMatch(await owner.page("/dashboard/subscribers?status=expired"), /Invite again/);
  });

  test("sign-ups that were never confirmed expire too", async () => {
    await sql`insert into subscribers (publication_id, email, status, confirm_token, confirm_sent_at, unsubscribe_token)
      values (${publicationId}, 'late@example.com', 'pending', 'late-token-123456789', now() - interval '9 days', 'late-unsub-123456789')`;
    const list = await owner.page("/dashboard/subscribers?status=expired");
    assert.match(list, /late@example.com/);
    assert.match(list, /Confirmation link expired/);
  });
});

describe("importing with invitations", () => {
  const form = (pasted: string, extra: Record<string, string> = {}) =>
    owner.formAction("/dashboard/subscribers/import", "subscribers/actions", "importSubscribers", {
      pasted,
      mode: "invite",
      ...extra,
    });

  test("invites new addresses, leaves existing ones alone, needs no consent box", async () => {
    await mail.clear();
    const { result } = await form("dan@example.com\neve@example.com\nada@example.com\nnope@");
    assert.deepEqual(
      { ...result.result, invalidSamples: undefined },
      { mode: "invited", added: 2, existing: 1, invalid: 1, invalidSamples: undefined },
    );
    await mail.waitFor("dan@example.com", "invited");
    await mail.waitFor("eve@example.com", "invited");
    assert.equal((await row("ada@example.com")).status, "active");
    assert.equal((await row("dan@example.com")).status, "pending");
  });

  test("the daily invitation limit applies", async () => {
    const many = Array.from({ length: 101 }, (_, i) => `bulk${i}@example.com`).join("\n");
    const { result } = await form(many);
    assert.match(result.error, /you can send \d+ more today/);
    assert.equal(await scalar(sql`select count(*) from subscribers where email like 'bulk%'`), "0");
  });

  test("importing as already subscribed still needs the consent box", async () => {
    const { result } = await form("fay@example.com", { mode: "subscribed" });
    assert.match(result.error, /agreed/);
  });
});

test("the dashboard counts only invitations that can still be answered", async () => {
  const html = await owner.page("/dashboard");
  assert.match(html, /Awaiting an answer/);
  assert.match(html, /status=waiting/);
});
