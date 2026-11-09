/** Teams: inviting editors and contributors, what each can do, bylines. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import {
  Client,
  createDraft,
  createOwner,
  linkIn,
  mail,
  resetDatabase,
  scalar,
  seedSubscribers,
  signIn,
  sql,
  waitForStatus,
} from "./helpers";

let owner: Client;
let publicationId: string;
const SLUG = "team-pub";

before(async () => {
  await resetDatabase();
  await mail.clear();
  ({ owner, publicationId } = await createOwner("boss@example.com", SLUG, "Team Times"));
  await seedSubscribers(publicationId, ["listed@example.com"]);
});
after(() => sql.end());

const team = (client: Client, name: string, args: unknown[]) =>
  client.action("/dashboard/team", "team/actions", name, args);

async function joinAs(email: string, role: string) {
  await mail.clear();
  const invited = await team(owner, "inviteToTeam", [email, role]);
  assert.equal(invited.result.ok, true, JSON.stringify(invited.result));
  const message = await mail.waitFor(email, "invited you to Team Times");
  const link = linkIn(message, "/dashboard/join/");
  const token = link.split("/").pop()!;
  const client = await signIn(email);
  assert.match(await client.page(`/dashboard/join/${token}`), /Join Team Times/);
  const accepted = await team(client, "acceptTeamInvite", [token]);
  assert.match(accepted.redirect ?? "", /\/dashboard(;|$)/);
  return client;
}

describe("teams", () => {
  let editor: Client;
  let contributor: Client;

  test("the free plan has one place; an editor joins through the emailed link", async () => {
    await sql`insert into account_billing (user_id, plan) select owner_id, 'pro' from publications where id = ${publicationId}`;
    editor = await joinAs("ed@example.com", "editor");
    const page = await editor.page("/dashboard/subscribers");
    assert.match(page, /listed@example.com/);
    assert.match(await owner.page("/dashboard/team"), /ed@example.com/);
  });

  test("an invitation only works for the address it was sent to", async () => {
    await mail.clear();
    await team(owner, "inviteToTeam", ["right@example.com", "editor"]);
    const link = linkIn(await mail.waitFor("right@example.com", "invited you"), "/dashboard/join/");
    const wrong = await signIn("wrong@example.com");
    const r = await team(wrong, "acceptTeamInvite", [link.split("/").pop()]);
    assert.equal(r.result.ok, false);
    assert.match(r.result.error, /right@example.com/);
    // Withdrawn.
    const id = await scalar(sql`select id from team_invites where email = 'right@example.com'`);
    assert.equal((await team(owner, "revokeInvite", [id])).result.ok, true);
  });

  test("contributors write drafts but can't send, see subscribers or billing", async () => {
    contributor = await joinAs("writer@example.com", "contributor");
    assert.equal((await team(contributor, "setMyName", ["Wren Writer"])).result.ok, true);
    const postId = await createDraft(
      contributor,
      "From the contributor",
      "from-contributor",
      "Words.",
    );
    assert.equal(
      await scalar(
        sql`select u.email from posts p join "user" u on u.id = p.author_id where p.id = ${postId}`,
      ),
      "writer@example.com",
    );
    const send = await contributor.action(
      `/dashboard/posts/${postId}`,
      "posts/actions",
      "sendPost",
      [postId, null],
    );
    assert.equal(send.result.ok, false);
    assert.match(await contributor.page(`/dashboard/posts/${postId}`), /An editor sends it/);

    // Redirects inside streamed pages arrive in the HTML (and the data never does).
    for (const path of ["/dashboard/subscribers", "/dashboard/billing", "/dashboard/settings"]) {
      const html = await contributor.page(path);
      assert.match(html, /\/dashboard\?denied=1/, path);
      assert.doesNotMatch(html, /listed@example.com/, path);
    }
    assert.equal((await contributor.fetch("/dashboard/subscribers/export")).status, 404);
    // Nor can they manage the team.
    assert.equal(
      (await team(contributor, "inviteToTeam", ["x@example.com", "editor"])).redirect?.includes(
        "denied",
      ),
      true,
    );

    // The editor sends it; the byline shows the contributor's name.
    await mail.clear();
    const sent = await editor.action(`/dashboard/posts/${postId}`, "posts/actions", "sendPost", [
      postId,
      null,
    ]);
    assert.equal(sent.result.ok, true, JSON.stringify(sent.result));
    await waitForStatus(postId, "sent");
    assert.match(await new Client().page(`/${SLUG}/p/from-contributor`), /By Wren Writer/);
  });

  test("editors can't see billing or invite people", async () => {
    assert.match(await editor.page("/dashboard/billing"), /denied=1/);
    const r = await team(editor, "inviteToTeam", ["y@example.com", "editor"]);
    assert.match(r.redirect ?? "", /denied/);
  });

  test("plan limits apply, and removing someone ends their access", async () => {
    await sql`update account_billing set plan = 'free' where user_id = (select owner_id from publications where id = ${publicationId})`;
    const r = await team(owner, "inviteToTeam", ["more@example.com", "editor"]);
    assert.equal(r.result.ok, false);
    assert.match(r.result.error, /plan includes 1 teammate/);

    const userId = await scalar(sql`select id from "user" where email = 'writer@example.com'`);
    assert.equal((await team(owner, "removeMember", [userId])).result.ok, true);
    const html = await contributor.page("/dashboard/posts");
    assert.match(html, /\/onboarding/);
    assert.doesNotMatch(html, /From the contributor/);
  });
});
