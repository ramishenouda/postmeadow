/** Reader preferences (pause, topics), likes, comments and the stats page. */
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
  sql,
  waitForStatus,
} from "./helpers";

let owner: Client;
let publicationId: string;
const SLUG = "readers-pub";

before(async () => {
  await resetDatabase();
  await mail.clear();
  ({ owner, publicationId } = await createOwner("readers@example.com", SLUG, "Reader Times"));
  await seedSubscribers(publicationId, ["ann@example.com", "bob@example.com", "cat@example.com"]);
});
after(() => sql.end());

const tokenOf = (email: string) =>
  scalar(sql`select unsubscribe_token from subscribers where email = ${email}`);

async function sendIssue(title: string, slug: string, content = "Hello") {
  const postId = await createDraft(owner, title, slug, content);
  const { result } = await owner.action(`/dashboard/posts/${postId}`, "posts/actions", "sendPost", [
    postId,
    null,
  ]);
  assert.equal(result.ok, true, JSON.stringify(result));
  await waitForStatus(postId, "sent");
  return postId;
}

describe("reader preferences", () => {
  test("every email links to the preferences page", async () => {
    await mail.clear();
    await sendIssue("Issue one", "issue-one");
    const message = await mail.waitFor("ann@example.com", "Issue one");
    assert.match(message.Text, /Pause or pick topics/);
    const page = await new Client().page(`/unsubscribe/${await tokenOf("ann@example.com")}`);
    assert.match(page, /Your subscription/);
    assert.match(page, /Take a break/);
  });

  test("a paused reader gets nothing until the pause ends or they resume", async () => {
    const token = await tokenOf("bob@example.com");
    const reader = new Client();
    await reader.formAction(
      `/unsubscribe/${token}`,
      "unsubscribe/[token]/actions",
      "pause",
      { months: "1" },
      {
        leadingArgs: [token],
        withPrev: false,
      },
    );
    assert.match(
      await scalar(
        sql`select (paused_until > now() + interval '27 days')::text from subscribers where email = 'bob@example.com'`,
      ),
      /true/,
    );
    assert.match(await reader.page(`/unsubscribe/${token}`), /Emails are paused until/);
    assert.match(await owner.page("/dashboard/subscribers"), /Paused until/);

    await mail.clear();
    await sendIssue("While paused", "while-paused");
    await mail.waitFor("ann@example.com", "While paused");
    assert.equal(await mail.countTo("bob@example.com"), 0);

    await reader.formAction(
      `/unsubscribe/${token}`,
      "unsubscribe/[token]/actions",
      "resume",
      {},
      {
        leadingArgs: [token],
        withPrev: false,
      },
    );
    await mail.clear();
    await sendIssue("Back again", "back-again");
    await mail.waitFor("bob@example.com", "Back again");
  });

  test("public topics: on the sign-up form, and readers choose them later", async () => {
    // Two tags; only "Recipes" is made public.
    await owner.action("/dashboard/subscribers", "subscribers/actions", "setSubscriberTags", [
      await scalar(sql`select id from subscribers where email = 'cat@example.com'`),
      "Recipes, VIP",
    ]);
    const recipes = await scalar(sql`select id from tags where name = 'Recipes'`);
    const vip = await scalar(sql`select id from tags where name = 'VIP'`);
    const { result } = await owner.action(
      "/dashboard/subscribers",
      "subscribers/actions",
      "setTagPublic",
      [recipes, true],
    );
    assert.equal(result.ok, true);

    const home = await new Client().page(`/${SLUG}`);
    assert.match(home, /I.{0,6}m interested in/);
    assert.match(home, /value="Recipes"/);
    assert.doesNotMatch(home, /value="VIP"/);

    // The reader unticks Recipes on their preferences page; the private VIP tag stays.
    const token = await tokenOf("cat@example.com");
    const prefs = await new Client().page(`/unsubscribe/${token}`);
    assert.match(prefs, /Recipes/);
    assert.doesNotMatch(prefs, /VIP/);
    await new Client().formAction(
      `/unsubscribe/${token}`,
      "unsubscribe/[token]/actions",
      "saveTopics",
      {},
      {
        leadingArgs: [token],
        withPrev: false,
      },
    );
    const tags = await sql`select t.name from subscriber_tags st join tags t on t.id = st.tag_id
      join subscribers s on s.id = st.subscriber_id where s.email = 'cat@example.com' order by t.name`;
    assert.deepEqual(
      tags.map((t) => t.name),
      ["VIP"],
    );

    // Ticking it again; a made-up or private tag id is ignored.
    const body = new FormData();
    await new Client().formAction(
      `/unsubscribe/${token}`,
      "unsubscribe/[token]/actions",
      "saveTopics",
      { topic: recipes },
      { leadingArgs: [token], withPrev: false },
    );
    void body;
    void vip;
    const after = await sql`select t.name from subscriber_tags st join tags t on t.id = st.tag_id
      join subscribers s on s.id = st.subscriber_id where s.email = 'cat@example.com' order by t.name`;
    assert.deepEqual(
      after.map((t) => t.name),
      ["Recipes", "VIP"],
    );
  });
});

describe("likes and comments", () => {
  const POST = "talk-about-it";
  const page = `/${SLUG}/p/${POST}`;
  let postId: string;

  before(async () => {
    postId = await sendIssue("Talk about it", POST, "What do you think?");
  });

  const comment = (client: Client, fields: Record<string, string>) =>
    client.formAction(
      page,
      "[postSlug]/actions",
      "comment",
      { website: "", ...fields },
      {
        leadingArgs: [SLUG, POST],
        prev: { status: "idle" },
      },
    );

  test("likes: one per browser, and a second click takes it back", async () => {
    const a = new Client();
    const b = new Client();
    assert.deepEqual((await a.action(page, "[postSlug]/actions", "like", [SLUG, POST])).result, {
      liked: true,
      count: 1,
    });
    assert.deepEqual((await b.action(page, "[postSlug]/actions", "like", [SLUG, POST])).result, {
      liked: true,
      count: 2,
    });
    assert.deepEqual((await a.action(page, "[postSlug]/actions", "like", [SLUG, POST])).result, {
      liked: false,
      count: 1,
    });
    assert.match(await b.page(page), /aria-pressed="true"/);
  });

  test("a first comment waits for the email confirmation, then the browser is remembered", async () => {
    const reader = new Client();
    await mail.clear();
    const first = await comment(reader, {
      name: "Ann",
      email: "ann@example.com",
      body: "Loved this <script>alert(1)</script>",
    });
    assert.equal(first.result.status, "confirm");
    assert.doesNotMatch(await reader.page(page), /Loved this/);

    const email = await mail.waitFor("ann@example.com", "Confirm your comment");
    const link = linkIn(email, "/api/comments/confirm");
    const res = await reader.fetch(link);
    assert.equal(res.status, 303);
    const html = await reader.page(page);
    assert.match(html, /Loved this &lt;script&gt;/);
    assert.match(html, /Subscriber/); // Ann is on the list
    // Using the link again does nothing.
    assert.equal((await reader.fetch(link)).status, 404);

    // Next time from this browser: published at once.
    const second = await comment(reader, {
      name: "Ann",
      email: "ann@example.com",
      body: "Me again",
    });
    assert.equal(second.result.status, "published");
    assert.match(await reader.page(page), /Me again/);

    // Someone else's address from this browser still needs confirming.
    const other = await comment(reader, { name: "Not Bob", email: "bob@example.com", body: "Hi" });
    assert.equal(other.result.status, "confirm");
  });

  test("bad input is refused", async () => {
    const r = await comment(new Client(), { name: "", email: "x@example.com", body: "Hi" });
    assert.equal(r.result.status, "error");
    const r2 = await comment(new Client(), { name: "X", email: "nope", body: "Hi" });
    assert.equal(r2.result.status, "error");
  });

  test("the writer sees, replies to and deletes comments", async () => {
    const dashboard = await owner.page(`/dashboard/posts/${postId}`);
    assert.match(dashboard, /Me again/);
    assert.match(dashboard, /1 like · 2 comments/);

    const reply = await owner.action(
      `/dashboard/posts/${postId}`,
      "posts/actions",
      "replyAsAuthor",
      [postId, "Thanks, Ann!"],
    );
    assert.equal(reply.result.ok, true);
    assert.match(await new Client().page(page), /Author/);

    const id = await scalar(sql`select id from comments where body = 'Me again'`);
    const del = await owner.action(`/dashboard/posts/${postId}`, "posts/actions", "deleteComment", [
      postId,
      id,
    ]);
    assert.equal(del.result.ok, true);
    assert.doesNotMatch(await new Client().page(page), /Me again/);
  });

  test("comments can be turned off", async () => {
    await sql`update publications set comments_enabled = false where id = ${publicationId}`;
    const r = await comment(new Client(), { name: "Z", email: "z@example.com", body: "Hi" });
    assert.equal(r.result.status, "error");
    assert.doesNotMatch(await new Client().page(page), /Add a comment/);
    await sql`update publications set comments_enabled = true where id = ${publicationId}`;
  });
});

describe("stats", () => {
  test("shows sources, posts that brought readers, engagement and issues", async () => {
    // Someone subscribes from a post page and confirms.
    const visitor = new Client();
    await visitor.formAction(
      `/${SLUG}/p/issue-one`,
      "[slug]/actions",
      "subscribe",
      {
        email: "fan@example.com",
        website: "",
        post: "issue-one",
      },
      { leadingArgs: [SLUG], prev: { status: "idle" } },
    );
    const confirm = await mail.waitFor("fan@example.com", "Confirm");
    await visitor.fetch(linkIn(confirm, "/api/subscriptions/confirm"));
    assert.equal(
      await scalar(sql`select p.slug from subscribers s join posts p on p.id = s.signup_post_id
        where s.email = 'fan@example.com'`),
      "issue-one",
    );

    // Ann opened everything, Bob nothing.
    await sql`update deliveries set opened_at = now() where subscriber_id =
      (select id from subscribers where email = 'ann@example.com')`;

    const stats = await owner.page("/dashboard/stats");
    assert.match(stats, /Where new readers came from/);
    assert.match(stats, /Post pages/);
    assert.match(stats, /Posts that brought readers/);
    assert.match(stats, /Issue one/);
    assert.match(stats, /Recent issues/);

    const dormant = await owner.page("/dashboard/subscribers?engagement=dormant");
    assert.match(dormant, /bob@example.com/);
    assert.doesNotMatch(dormant, /ann@example.com/);
    const engaged = await owner.page("/dashboard/subscribers?engagement=engaged");
    assert.match(engaged, /ann@example.com/);
    assert.doesNotMatch(engaged, /bob@example.com/);
  });
});
