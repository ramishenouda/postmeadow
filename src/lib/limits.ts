import "server-only";
import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { emailUsage, publications, subscribers } from "@/db/schema";
import { getBilling } from "@/lib/billing/service";
import { monthlyEmailLimit, PLANS, isPlanId, subscriberLimit } from "@/lib/plans";

/**
 * Plan limits on sending (src/lib/plans.ts): active subscribers across the account,
 * and newsletter emails per calendar month (UTC). Checked by queuePost, the single
 * gate every send goes through ("Send now" and scheduled sends).
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const usageMonth = (d = new Date()) => d.toISOString().slice(0, 7);

export type AccountUsage = {
  plan: string;
  planName: string;
  subscribers: { used: number; limit: number };
  emails: { used: number; limit: number; month: string };
};

export async function accountUsage(ownerId: string): Promise<AccountUsage> {
  const billing = await getBilling(ownerId);
  const plan = billing?.plan ?? "free";
  const month = usageMonth();
  const [[{ n }], [usage]] = await Promise.all([
    db
      .select({ n: count() })
      .from(subscribers)
      .innerJoin(publications, eq(subscribers.publicationId, publications.id))
      .where(and(eq(publications.ownerId, ownerId), eq(subscribers.status, "active"))),
    db
      .select({ emails: emailUsage.emails })
      .from(emailUsage)
      .where(and(eq(emailUsage.userId, ownerId), eq(emailUsage.month, month))),
  ]);
  return {
    plan,
    planName: isPlanId(plan) ? PLANS[plan].name : PLANS.free.name,
    subscribers: { used: n, limit: subscriberLimit(plan) },
    emails: { used: usage?.emails ?? 0, limit: monthlyEmailLimit(plan), month },
  };
}

const fmt = (n: number) => n.toLocaleString("en");

/** Why sending `recipients` emails isn't allowed on this plan right now, or null. */
export function limitBlocker(usage: AccountUsage, recipients: number): string | null {
  const { subscribers: subs, emails, planName } = usage;
  if (subs.used > subs.limit) {
    return (
      `You have ${fmt(subs.used)} subscribers, more than the ${fmt(subs.limit)} on the ` +
      `${planName} plan. Upgrade your plan to keep sending. Everyone who signs up stays on your list.`
    );
  }
  if (emails.used + recipients > emails.limit) {
    const left = Math.max(0, emails.limit - emails.used);
    return (
      `This would send ${fmt(recipients)} emails, and you have ${fmt(left)} of ` +
      `${fmt(emails.limit)} left this month on the ${planName} plan. Upgrade your plan, or send ` +
      "it next month."
    );
  }
  return null;
}

/** Count queued newsletter emails toward this month's limit (inside the send transaction). */
export async function recordEmails(tx: Tx, ownerId: string, n: number) {
  await tx
    .insert(emailUsage)
    .values({ userId: ownerId, month: usageMonth(), emails: n })
    .onConflictDoUpdate({
      target: [emailUsage.userId, emailUsage.month],
      set: { emails: sql`${emailUsage.emails} + ${n}` },
    });
}

/** "Near the limit" for the dashboard banner: 90% or more of either limit. */
export function nearLimit(usage: AccountUsage): "over" | "near" | null {
  const ratios = [
    usage.subscribers.used / usage.subscribers.limit,
    usage.emails.used / usage.emails.limit,
  ];
  if (usage.subscribers.used > usage.subscribers.limit || usage.emails.used >= usage.emails.limit) {
    return "over";
  }
  return ratios.some((r) => r >= 0.9) ? "near" : null;
}
