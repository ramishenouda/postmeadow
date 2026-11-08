/** Sending at scale: batching, crash recovery and concurrent workers. */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
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
let publicationId: string;
const ACTIVE = 300;

before(async () => {
  await resetDatabase();
  await mail.clear();
  ({ owner, publicationId } = await createOwner("bulk@example.com", "bulk-pub"));
  await seedSubscribers(
    publicationId,
    Array.from({ length: ACTIVE }, (_, i) => `bulk${i}@example.com`),
  );
});
after(() => sql.end());

/** Simulates a post that was locked for sending and had deliveries queued. */
async function queueManually(postId: string) {
  await sql`update posts set status = 'sending', published_at = now() where id = ${postId}`;
  await sql`insert into deliveries (post_id, subscriber_id)
    select ${postId}, id from subscribers where publication_id = ${publicationId} and status = 'active'`;
}

test(`sends to ${ACTIVE} subscribers in batches, exactly once each`, async () => {
  const postId = await createDraft(owner, "Bulk issue", "bulk-issue", "Hi **all**");
  await mail.clear();
  const { result } = await owner.action(`/dashboard/posts/${postId}`, "posts/actions", "sendPost", [
    postId,
  ]);
  assert.equal(result.ok, true);
  await waitForStatus(postId, "sent");
  assert.equal(
    await scalar(
      sql`select count(*) from deliveries where post_id = ${postId} and status = 'sent'`,
    ),
    String(ACTIVE),
  );
  assert.equal(await mail.total(), ACTIVE);
});

test("resuming after a crash skips people who already got it", async () => {
  const postId = await createDraft(owner, "Crash test", "crash-test");
  await queueManually(postId);
  // A worker died: 5 rows claimed an hour ago (stale), 3 already sent.
  await sql`update deliveries set status = 'sending', updated_at = now() - interval '1 hour'
    where id in (select id from deliveries where post_id = ${postId} order by id limit 5)`;
  await sql`update deliveries set status = 'sent', sent_at = now()
    where id in (select id from deliveries where post_id = ${postId} and status = 'queued' order by id limit 3)`;

  await mail.clear();
  const { result } = await owner.action(
    `/dashboard/posts/${postId}`,
    "posts/actions",
    "resumeSend",
    [postId],
  );
  assert.equal(result.ok, true);
  await waitForStatus(postId, "sent");
  assert.equal(
    await scalar(
      sql`select count(*) from deliveries where post_id = ${postId} and status in ('queued','sending')`,
    ),
    "0",
  );
  assert.equal(await mail.total(), ACTIVE - 3);
});

test("three workers at once still send one email per person", async () => {
  const postId = await createDraft(owner, "Race", "race");
  await queueManually(postId);
  await mail.clear();
  await Promise.all(
    [1, 2, 3].map(() =>
      owner.action(`/dashboard/posts/${postId}`, "posts/actions", "resumeSend", [postId]),
    ),
  );
  await waitForStatus(postId, "sent");
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(await mail.total(), ACTIVE);
});
