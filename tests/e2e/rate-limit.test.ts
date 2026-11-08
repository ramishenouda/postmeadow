/** Abuse protection on the public subscribe form. */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Client, createOwner, mail, resetDatabase, scalar, sql } from "./helpers";

const SLUG = "limits-pub";
/** Must match the test server's CONFIRMATIONS_PER_PUBLICATION_PER_HOUR (scripts/e2e.ts). */
const PUBLICATION_CAP = Number(process.env.E2E_CONFIRMATION_CAP);

before(async () => {
  await resetDatabase();
  await createOwner("limits@example.com", SLUG);
  await mail.clear(); // only count confirmation emails
});
after(() => sql.end());

const subscribe = (client: Client, email: string) =>
  client.formAction(
    `/${SLUG}`,
    "[slug]/actions",
    "subscribe",
    { email, website: "" },
    { leadingArgs: [SLUG], prev: { status: "idle" } },
  );

test("one visitor gets 10 attempts per 10 minutes", async () => {
  const visitor = new Client();
  for (let i = 0; i < 10; i++) {
    const { result } = await subscribe(visitor, `ip-test-${i}@example.com`);
    assert.equal(result.status, "success", `attempt ${i + 1}: ${JSON.stringify(result)}`);
  }
  const blocked = await subscribe(visitor, "ip-test-11@example.com");
  assert.equal(blocked.result.status, "error");
  assert.match(blocked.result.message, /Too many attempts/);
  assert.equal(
    await scalar(sql`select count(*) from subscribers where email = 'ip-test-11@example.com'`),
    "0",
  );
});

test("other visitors are not affected", async () => {
  const { result } = await subscribe(new Client(), "someone-else@example.com");
  assert.equal(result.status, "success");
});

test("per-publication cap stops confirmation emails even with rotating IPs", async () => {
  const sent = Number(await scalar(sql`select count(*) from subscribers where status = 'pending'`));
  for (let i = sent; i < PUBLICATION_CAP; i++) {
    const { result } = await subscribe(new Client(), `cap-${i}@example.com`);
    assert.equal(result.status, "success", JSON.stringify(result));
  }
  const blocked = await subscribe(new Client(), "over-cap@example.com");
  assert.equal(blocked.result.status, "error");
  assert.match(blocked.result.message, /paused/);
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(await mail.countTo("over-cap@example.com"), 0);
  assert.equal(await mail.total(), PUBLICATION_CAP);
});
