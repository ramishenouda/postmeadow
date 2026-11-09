/** How invitations and sign-ups are shown (invited, unconfirmed, expired…), and the email. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import InvitationEmail from "../../src/emails/invitation";
import {
  canRemove,
  CONFIRM_TTL_DAYS,
  expiresAt,
  subscriberState,
} from "../../src/lib/subscriber-state";

const now = new Date("2026-11-09T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 864e5);

test("pending splits into invited, unconfirmed and expired", () => {
  const invited = { status: "pending", invitedAt: daysAgo(1), confirmSentAt: daysAgo(1) };
  const signedUp = { status: "pending", invitedAt: null, confirmSentAt: daysAgo(1) };
  assert.equal(subscriberState(invited, now), "invited");
  assert.equal(subscriberState(signedUp, now), "unconfirmed");

  // Exactly at the deadline it has expired; a minute before, it hasn't.
  const old = daysAgo(CONFIRM_TTL_DAYS);
  assert.equal(subscriberState({ ...invited, confirmSentAt: old }, now), "expired");
  assert.equal(subscriberState({ ...signedUp, confirmSentAt: old }, now), "expired");
  const almost = new Date(old.getTime() + 60_000);
  assert.equal(subscriberState({ ...invited, confirmSentAt: almost }, now), "invited");

  // No send time recorded: nothing can still be answered.
  assert.equal(subscriberState({ ...signedUp, confirmSentAt: null }, now), "expired");
});

test("other statuses show as they are", () => {
  for (const status of ["active", "declined", "unsubscribed", "bounced"]) {
    assert.equal(
      subscriberState({ status, invitedAt: daysAgo(30), confirmSentAt: daysAgo(30) }, now),
      status,
    );
  }
});

test("invitations expire a week after they're sent", () => {
  assert.equal(expiresAt(daysAgo(0))?.toISOString(), "2026-11-16T12:00:00.000Z");
  assert.equal(expiresAt(null), null);
});

test("records of people saying no can't be removed", () => {
  assert.equal(canRemove({ status: "active", invitedAt: daysAgo(3) }), true);
  assert.equal(canRemove({ status: "pending", invitedAt: null }), true);
  // An open or expired invitation: removing it would reset the invitation limit.
  assert.equal(canRemove({ status: "pending", invitedAt: daysAgo(1) }), false);
  for (const status of ["declined", "unsubscribed", "bounced"]) {
    assert.equal(canRemove({ status, invitedAt: null }), false, status);
  }
});

test("the invitation email links to the page, never straight to an answer", () => {
  const html = renderToStaticMarkup(
    <InvitationEmail
      publicationName="The Weekly Meadow"
      inviter="Rami from The Weekly Meadow"
      description="Five small things every Sunday."
      inviteUrl="https://app.test/invite/tok"
      declineUrl="https://app.test/invite/tok?answer=no"
      expires="November 16"
      accent="#15803d"
    />,
  );
  const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(links.sort(), [
    "https://app.test/invite/tok",
    "https://app.test/invite/tok?answer=no",
  ]);
  assert.match(html, /<strong>Rami from The Weekly Meadow<\/strong> would like to send you/);
  assert.match(html, /expires on November 16/);
  assert.match(html, /background-color:#15803d/);
});

test("when the sender is the publication, the email doesn't repeat the name", () => {
  const html = renderToStaticMarkup(
    <InvitationEmail
      publicationName="Circuit"
      inviter="Circuit"
      inviteUrl="https://app.test/invite/t"
      declineUrl="https://app.test/invite/t?answer=no"
      expires="November 16"
      accent="#4f46e5"
    />,
  );
  assert.match(html, /You(&#x27;|')ve been invited to receive <strong>Circuit<\/strong>/);
});
