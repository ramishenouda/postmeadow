import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { publications } from "@/db/schema";
import { notifyAdmins, notifyUser } from "@/lib/notify";
import { absoluteUrl } from "@/lib/urls";

/**
 * Sending reputation is shared: one publication that spams hurts delivery for every
 * customer. Over the last 30 days, a publication that gets too many spam reports or
 * hard bounces is paused automatically, and admins are told. Thresholds follow what
 * inbox providers tolerate (spam reports above ~0.3% start hurting delivery).
 */
export const REPUTATION = {
  windowDays: 30,
  /** Below this many emails the rates mean little. */
  minDelivered: 100,
  maxComplaintRate: 0.003,
  maxBounceRate: 0.1,
};

export type Reputation = { delivered: number; bounced: number; complained: number };

export async function reputation(publicationId: string): Promise<Reputation> {
  const [row] = await db.execute<{ delivered: number; bounced: number; complained: number }>(sql`
    select
      count(*)::int as delivered,
      count(*) filter (where d.status = 'bounced')::int as bounced,
      count(*) filter (where d.status = 'complained')::int as complained
    from deliveries d
    join posts p on p.id = d.post_id
    where p.publication_id = ${publicationId}
      and d.sent_at > now() - make_interval(days => ${REPUTATION.windowDays})
  `);
  return row ?? { delivered: 0, bounced: 0, complained: 0 };
}

const pct = (n: number) => `${(n * 100).toFixed(n < 0.01 ? 2 : 1)}%`;

/** Why these numbers are a problem, or null. */
export function reputationProblem(r: Reputation): string | null {
  if (r.delivered < REPUTATION.minDelivered) return null;
  const complaints = r.complained / r.delivered;
  const bounces = r.bounced / r.delivered;
  if (complaints > REPUTATION.maxComplaintRate) {
    return `Too many spam reports: ${pct(complaints)} of emails in the last ${REPUTATION.windowDays} days (the limit is ${pct(REPUTATION.maxComplaintRate)}).`;
  }
  if (bounces > REPUTATION.maxBounceRate) {
    return `Too many bounces: ${pct(bounces)} of emails in the last ${REPUTATION.windowDays} days went to addresses that don't exist (the limit is ${pct(REPUTATION.maxBounceRate)}).`;
  }
  return null;
}

/** Pause a publication: nothing can be sent until an admin resumes it. Tells the writer. */
export async function suspendPublication(publicationId: string, reason: string) {
  const [p] = await db
    .update(publications)
    .set({ suspendedAt: new Date(), suspendedReason: reason })
    .where(and(eq(publications.id, publicationId), isNull(publications.suspendedAt)))
    .returning({ ownerId: publications.ownerId, name: publications.name });
  if (!p) return false;
  await notifyUser(p.ownerId, `Sending is paused for ${p.name}`, {
    title: "Sending is paused",
    paragraphs: [
      `We've paused sending for ${p.name}. ${reason}`,
      "Your posts, page and subscribers are safe; only sending is paused. Reply to this email and we'll help you sort it out.",
    ],
    action: { label: "Open your dashboard", url: absoluteUrl("/dashboard") },
  });
  return true;
}

export async function resumePublication(publicationId: string) {
  const [p] = await db
    .update(publications)
    .set({ suspendedAt: null, suspendedReason: null })
    .where(eq(publications.id, publicationId))
    .returning({ ownerId: publications.ownerId, name: publications.name });
  if (!p) return false;
  await notifyUser(p.ownerId, `Sending is back on for ${p.name}`, {
    title: "Sending is back on",
    paragraphs: [`You can send from ${p.name} again. Thanks for your patience.`],
    action: { label: "Open your dashboard", url: absoluteUrl("/dashboard") },
  });
  return true;
}

/** After a spam report or hard bounce: pause the publication if its rates are too high. */
export async function checkReputation(publicationId: string) {
  const problem = reputationProblem(await reputation(publicationId));
  if (!problem) return;
  if (await suspendPublication(publicationId, problem)) {
    const [p] = await db
      .select({ name: publications.name, slug: publications.slug })
      .from(publications)
      .where(eq(publications.id, publicationId));
    await notifyAdmins(`Paused automatically: ${p?.name ?? publicationId}`, {
      title: "A publication was paused automatically",
      paragraphs: [`${p?.name} (/${p?.slug}): ${problem}`],
      action: { label: "Open admin", url: absoluteUrl("/admin") },
    });
  }
}
