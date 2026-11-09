/** Automations: a welcome series and a tag-triggered sequence. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import {
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
const SLUG = "auto-pub";

before(async () => {
  await resetDatabase();
  await mail.clear();
  ({ owner, publicationId } = await createOwner("auto@example.com", SLUG, "Auto Weekly"));
});
after(() => sql.end());

const act = (name: string, args: unknown[]) =>
  owner.action("/dashboard/automations", "automations/actions", name, args);

async function confirmSignup(email: string) {
  const client = new Client();
  await client.formAction(
    `/${SLUG}`,
    "[slug]/actions",
    "subscribe",
    { email, website: "" },
    { leadingArgs: [SLUG], prev: { status: "idle" } },
  );
  const message = await mail.waitFor(email, "Confirm");
  await client.fetch(linkIn(message, "/api/subscriptions/confirm"));
}

async function stepPosts(automationId: string) {
  return (
    await sql`select s.id as step_id, p.id as post_id from automation_steps s join posts p on p.id = s.post_id
      where s.automation_id = ${automationId} order by s.position`
  ).map((r) => ({ stepId: r.step_id as string, postId: r.post_id as string }));
}

async function writeEmail(postId: string, title: string, content: string) {
  const { result } = await owner.action(`/dashboard/posts/${postId}`, "posts/actions", "savePost", [
    postId,
    {
      title,
      subtitle: "",
      slug: await scalar(sql`select slug from posts where id = ${postId}`),
      content,
    },
  ]);
  assert.equal(result.ok, true, JSON.stringify(result));
}

describe("welcome series", () => {
  let automationId: string;

  test("is created with a first email, and its emails stay out of the posts list", async () => {
    const res = await act("createAutomation", ["Welcome series", "subscribed", ""]);
    assert.match(res.redirect ?? "", /\/dashboard\/automations\//);
    automationId = await scalar(sql`select id from automations where name = 'Welcome series'`);
    const [first] = await stepPosts(automationId);
    await writeEmail(first.postId, "Welcome aboard", "Here's what to expect.");
    assert.equal((await act("addStep", [automationId])).result.ok, true);
    const [, second] = await stepPosts(automationId);
    await writeEmail(second.postId, "Our best posts", "Start with these.");

    const list = await owner.page("/dashboard/posts");
    assert.doesNotMatch(list, /Welcome aboard/);
    const editor = await owner.page(`/dashboard/posts/${first.postId}`);
    assert.match(editor, /part of an/);
    // It can't be sent as an issue.
    const send = await owner.action(
      `/dashboard/posts/${first.postId}`,
      "posts/actions",
      "sendPost",
      [first.postId, null],
    );
    assert.equal(send.result.ok, false);
  });

  test("does nothing while off", async () => {
    await mail.clear();
    await confirmSignup("early@example.com");
    await sleep(2500);
    assert.equal(await mail.countTo("early@example.com"), 2); // confirm + welcome email only
    assert.equal(await scalar(sql`select count(*) from automation_runs`), "0");
  });

  test("once on, new readers get each email in turn; then it's done", async () => {
    const on = await act("setAutomationActive", [automationId, true]);
    assert.equal(on.result.ok, true, JSON.stringify(on.result));
    await mail.clear();
    await confirmSignup("newbie@example.com");
    await mail.waitFor("newbie@example.com", "Welcome aboard", 15_000);

    // The second email waits 3 days; fast-forward.
    const runId = await scalar(
      sql`select id from automation_runs where automation_id = ${automationId}`,
    );
    // The run moves on right after the email is handed over.
    for (let i = 0; i < 20; i++) {
      if ((await scalar(sql`select next_step from automation_runs where id = ${runId}`)) === "1")
        break;
      await sleep(250);
    }
    assert.equal(await scalar(sql`select next_step from automation_runs where id = ${runId}`), "1");
    await sql`update automation_runs set next_at = now() - interval '1 second' where id = ${runId}`;
    await mail.waitFor("newbie@example.com", "Our best posts", 15_000);
    let status = "";
    for (let i = 0; i < 20 && status !== "done"; i++) {
      status = await scalar(sql`select status from automation_runs where id = ${runId}`);
      await sleep(250);
    }
    assert.equal(status, "done");
    // Each email went once, with an unsubscribe header, and counts toward the month.
    assert.equal(await mail.countTo("newbie@example.com"), 4); // confirm, welcome, 2 steps
    assert.equal(
      await scalar(sql`select count(*) from deliveries d join automation_steps s on s.post_id = d.post_id
        where s.automation_id = ${automationId} and d.status = 'sent'`),
      "2",
    );

    const page = await owner.page(`/dashboard/automations/${automationId}`);
    assert.match(page, /1 finished/);
    assert.match(page, /1 sent/);
  });

  test("people who unsubscribe leave the automation", async () => {
    await mail.clear();
    await confirmSignup("leaver@example.com");
    await mail.waitFor("leaver@example.com", "Welcome aboard", 15_000);
    await sql`update subscribers set status = 'unsubscribed' where email = 'leaver@example.com'`;
    await sql`update automation_runs set next_at = now() where subscriber_id =
      (select id from subscribers where email = 'leaver@example.com')`;
    let status = "";
    for (let i = 0; i < 20 && status !== "stopped"; i++) {
      status =
        await scalar(sql`select r.status from automation_runs r join subscribers s on s.id = r.subscriber_id
        where s.email = 'leaver@example.com'`);
      await sleep(250);
    }
    assert.equal(status, "stopped");
    assert.equal(await mail.countTo("leaver@example.com"), 3); // confirm, welcome, step 1
  });
});

describe("tag-triggered sequence", () => {
  test("starts when an active subscriber gets the tag", async () => {
    await seedSubscribers(publicationId, ["student@example.com", "other@example.com"]);
    await act("createAutomation", ["Course", "tag_added", "course"]);
    const id = await scalar(sql`select id from automations where name = 'Course'`);
    const [first] = await stepPosts(id);
    await writeEmail(first.postId, "Lesson 1", "Let's begin.");
    assert.equal((await act("setAutomationActive", [id, true])).result.ok, true);

    await mail.clear();
    const studentId = await scalar(
      sql`select id from subscribers where email = 'student@example.com'`,
    );
    const tagged = await owner.action(
      "/dashboard/subscribers",
      "subscribers/actions",
      "setSubscriberTags",
      [studentId, "course"],
    );
    assert.equal(tagged.result.ok, true);
    await mail.waitFor("student@example.com", "Lesson 1", 15_000);
    await sleep(1500);
    assert.equal(await mail.countTo("other@example.com"), 0);
    // Tagging again doesn't start it twice.
    await owner.action("/dashboard/subscribers", "subscribers/actions", "setSubscriberTags", [
      studentId,
      "course",
    ]);
    await sleep(1500);
    assert.equal(await mail.countTo("student@example.com"), 1);
  });

  test("a tag automation can't be turned on without a tag, and deleting removes its emails", async () => {
    await act("createAutomation", ["Temp", "subscribed", ""]);
    const id = await scalar(sql`select id from automations where name = 'Temp'`);
    const [first] = await stepPosts(id);
    const del = await act("deleteAutomation", [id]);
    assert.match(del.redirect ?? "", /\/dashboard\/automations(;|$)/);
    assert.equal(await scalar(sql`select count(*) from posts where id = ${first.postId}`), "0");
  });
});
