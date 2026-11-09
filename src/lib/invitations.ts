import "server-only";
import { senderAddress } from "@/lib/email/sender-domains";
import { and, count, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { createElement } from "react";
import { db } from "@/db";
import { publications, subscribers } from "@/db/schema";
import InvitationEmail from "@/emails/invitation";
import { getBilling } from "@/lib/billing/service";
import { DEFAULT_ACCENT } from "@/lib/color";
import { renderEmail } from "@/lib/email/render";
import { batchTransport, fromWithName, type EmailMessage } from "@/lib/email/send";
import { invitesPerDay } from "@/lib/plans";
import { CONFIRM_TTL_DAYS, expiresAt, subscriberState } from "@/lib/subscribers";
import { randomToken } from "@/lib/tokens";
import { absoluteUrl } from "@/lib/urls";

/**
 * Writers invite people; people choose. An invited address is "pending" with
 * `invitedAt` set until the person accepts (→ active) or declines (→ declined, and
 * the writer can never invite them again). Unanswered invitations expire after
 * CONFIRM_TTL_DAYS and can be re-sent, up to MAX_INVITES in total.
 */

/** Invitations per address, ever. Stops writers from pestering people. */
export const MAX_INVITES = 2;

type Publication = typeof publications.$inferSelect;
type Subscriber = typeof subscribers.$inferSelect;

export type InviteResult = { ok: true } | { ok: false; error: string };

const dayFormat = new Intl.DateTimeFormat("en", { month: "long", day: "numeric", timeZone: "UTC" });

/** Invitations this publication can still send in the next 24 hours. */
export async function inviteAllowance(publication: Pick<Publication, "id" | "ownerId">) {
  const billing = await getBilling(publication.ownerId);
  const limit = invitesPerDay(billing?.plan ?? "free");
  const [{ n }] = await db
    .select({ n: count() })
    .from(subscribers)
    .where(
      and(
        eq(subscribers.publicationId, publication.id),
        gt(subscribers.invitedAt, sql`now() - interval '1 day'`),
      ),
    );
  return { limit, remaining: Math.max(0, limit - n) };
}

/** Why this address can't be invited (a message for the writer), or null if it can. */
export function inviteBlocker(existing: Subscriber | undefined, email: string): string | null {
  if (!existing) return null;
  const until = () => dayFormat.format(expiresAt(existing.confirmSentAt) ?? new Date());
  switch (subscriberState(existing)) {
    case "active":
      return `${email} is already subscribed.`;
    case "invited":
      return `${email} already has an invitation waiting (until ${until()}).`;
    case "unconfirmed":
      return `${email} signed up and hasn't confirmed yet. Their link works until ${until()}.`;
    case "declined":
      return `${email} declined your invitation. Only they can subscribe now, from your page.`;
    case "unsubscribed":
      return `${email} unsubscribed. Only they can subscribe again, from your page.`;
    case "bounced":
      return `Emails to ${email} bounced, so we won't send to it.`;
    case "expired":
      return existing.inviteCount >= MAX_INVITES
        ? `${email} has been invited ${MAX_INVITES} times already. Only they can subscribe now, from your page.`
        : null;
  }
}

/** Invite one address: "Add subscriber", or "Invite again" on an expired invitation. */
export async function inviteOne(publication: Publication, email: string): Promise<InviteResult> {
  const [existing] = await db
    .select()
    .from(subscribers)
    .where(and(eq(subscribers.publicationId, publication.id), eq(subscribers.email, email)))
    .limit(1);
  if (publication.suspendedAt) return { ok: false, error: "Sending is paused on this account." };
  const blocked = inviteBlocker(existing, email);
  if (blocked) return { ok: false, error: blocked };

  const { limit, remaining } = await inviteAllowance(publication);
  if (remaining < 1) {
    return {
      ok: false,
      error: `You've sent today's ${limit.toLocaleString("en")} invitations. Try again tomorrow.`,
    };
  }

  const token = randomToken();
  const now = new Date();
  if (existing) {
    await db
      .update(subscribers)
      .set({
        status: "pending",
        confirmToken: token,
        confirmSentAt: now,
        invitedAt: now,
        inviteCount: sql`${subscribers.inviteCount} + 1`,
        statusReason: null,
      })
      .where(eq(subscribers.id, existing.id));
  } else {
    const inserted = await db
      .insert(subscribers)
      .values({
        publicationId: publication.id,
        email,
        status: "pending",
        confirmToken: token,
        confirmSentAt: now,
        invitedAt: now,
        inviteCount: 1,
        source: "invite",
        unsubscribeToken: randomToken(),
      })
      .onConflictDoNothing()
      .returning({ id: subscribers.id });
    if (inserted.length === 0) return { ok: false, error: `${email} is already on your list.` };
  }

  await sendInvitations(publication, [{ email, token, sentAt: now }]);
  return { ok: true };
}

const CHUNK = 1_000;

/**
 * Invite addresses that aren't on the list yet (CSV import). Anyone already on the
 * list, in any state, is left alone. Returns the invitations to send (with
 * sendInvitations, after responding) or an error if it's over today's allowance.
 */
export async function createInvitations(
  publication: Publication,
  emails: string[],
): Promise<
  | { ok: true; invited: { email: string; token: string; sentAt: Date }[]; existing: number }
  | { ok: false; error: string }
> {
  if (publication.suspendedAt) return { ok: false, error: "Sending is paused on this account." };
  const known = new Set<string>();
  for (let i = 0; i < emails.length; i += CHUNK) {
    const rows = await db
      .select({ email: subscribers.email })
      .from(subscribers)
      .where(
        and(
          eq(subscribers.publicationId, publication.id),
          inArray(subscribers.email, emails.slice(i, i + CHUNK)),
        ),
      );
    for (const r of rows) known.add(r.email);
  }
  const fresh = emails.filter((e) => !known.has(e));

  const { limit, remaining } = await inviteAllowance(publication);
  if (fresh.length > remaining) {
    return {
      ok: false,
      error:
        `That's ${fresh.length.toLocaleString("en")} invitations, and you can send ` +
        `${remaining.toLocaleString("en")} more today (${limit.toLocaleString("en")} a day on ` +
        "your plan). Import fewer at a time, or add them as already subscribed.",
    };
  }

  const now = new Date();
  const invited: { email: string; token: string; sentAt: Date }[] = [];
  for (let i = 0; i < fresh.length; i += CHUNK) {
    const rows = fresh.slice(i, i + CHUNK).map((email) => ({
      publicationId: publication.id,
      email,
      status: "pending" as const,
      confirmToken: randomToken(),
      confirmSentAt: now,
      invitedAt: now,
      inviteCount: 1,
      source: "import",
      unsubscribeToken: randomToken(),
    }));
    const inserted = await db
      .insert(subscribers)
      .values(rows)
      .onConflictDoNothing()
      .returning({ email: subscribers.email, token: subscribers.confirmToken });
    for (const r of inserted) invited.push({ email: r.email, token: r.token!, sentAt: now });
  }
  return { ok: true, invited, existing: emails.length - invited.length };
}

export const inviteUrl = (token: string) => absoluteUrl(`/invite/${token}`);

/** Sends invitation emails in batches, from the publication's name. */
export async function sendInvitations(
  publication: Publication,
  recipients: { email: string; token: string; sentAt: Date }[],
) {
  const transport = batchTransport();
  const messages: EmailMessage[] = [];
  for (const { email, token, sentAt } of recipients) {
    const { html, text } = await renderEmail(
      createElement(InvitationEmail, {
        publicationName: publication.name,
        inviter: publication.fromName,
        description: publication.description,
        inviteUrl: inviteUrl(token),
        declineUrl: `${inviteUrl(token)}?answer=no`,
        expires: dayFormat.format(expiresAt(sentAt)!),
        accent: publication.accentColor ?? DEFAULT_ACCENT,
      }),
    );
    messages.push({
      to: email,
      from: fromWithName(publication.name, senderAddress(publication)),
      replyTo: publication.replyTo ?? undefined,
      subject:
        publication.fromName === publication.name
          ? `You're invited to subscribe to ${publication.name}`
          : `${publication.fromName} invited you to subscribe to ${publication.name}`,
      html,
      text,
    });
  }
  for (let i = 0; i < messages.length; i += transport.maxBatchSize) {
    if (i > 0) await new Promise((r) => setTimeout(r, transport.batchDelayMs));
    const results = await transport.sendBatch(messages.slice(i, i + transport.maxBatchSize));
    const failed = results.filter((r) => !r.ok).length;
    if (failed) console.error("invitations failed", { publicationId: publication.id, failed });
  }
}

// ─── The reader's side ───────────────────────────────────────────────────────

export type Invitation = NonNullable<Awaited<ReturnType<typeof findInvitation>>>;

/** An invitation by its link token, with what the page needs to show. */
export async function findInvitation(token: string) {
  if (!/^[A-Za-z0-9_-]{16,}$/.test(token)) return null;
  const [row] = await db
    .select({
      id: subscribers.id,
      email: subscribers.email,
      status: subscribers.status,
      invitedAt: subscribers.invitedAt,
      confirmSentAt: subscribers.confirmSentAt,
      publication: {
        name: publications.name,
        slug: publications.slug,
        description: publications.description,
        fromName: publications.fromName,
        logoUrl: publications.logoUrl,
        accentColor: publications.accentColor,
        fontStyle: publications.fontStyle,
      },
    })
    .from(subscribers)
    .innerJoin(publications, eq(subscribers.publicationId, publications.id))
    .where(and(eq(subscribers.confirmToken, token), isNotNull(subscribers.invitedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * Accept or decline. Only a pending invitation that hasn't expired can be answered.
 * The token stays, so the page can keep showing the outcome.
 */
export async function answerInvitation(token: string, answer: "accept" | "decline") {
  const now = new Date();
  const [row] = await db
    .update(subscribers)
    .set(
      answer === "accept"
        ? { status: "active", confirmedAt: now }
        : { status: "declined", unsubscribedAt: now },
    )
    .where(
      and(
        eq(subscribers.confirmToken, token),
        eq(subscribers.status, "pending"),
        isNotNull(subscribers.invitedAt),
        gt(subscribers.confirmSentAt, sql`now() - ${`${CONFIRM_TTL_DAYS} days`}::interval`),
      ),
    )
    .returning({ id: subscribers.id });
  return row ?? null;
}
