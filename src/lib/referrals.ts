import "server-only";
import { randomInt } from "node:crypto";
import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { publications, referralGrants, referralRewards, subscribers } from "@/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";
import { liveDomain } from "@/lib/domains";
import { notifyUser, sendNotice } from "@/lib/notify";
import { absoluteUrl, publicationUrl } from "@/lib/urls";

/**
 * Referral program. Each reader gets a personal link (/{slug}?ref=CODE). People who
 * sign up through it and confirm count for that reader; reaching a reward's threshold
 * emails the reader and the writer (who sends the reward themselves).
 */

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no look-alikes
export const MAX_REWARDS = 10;

const newCode = () =>
  Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

/** The reader's share code, created on first use. */
export async function ensureReferralCode(subscriberId: string): Promise<string> {
  const [row] = await db
    .select({ code: subscribers.referralCode })
    .from(subscribers)
    .where(eq(subscribers.id, subscriberId));
  if (row?.code) return row.code;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [updated] = await db
        .update(subscribers)
        .set({ referralCode: newCode() })
        .where(and(eq(subscribers.id, subscriberId), isNull(subscribers.referralCode)))
        .returning({ code: subscribers.referralCode });
      if (updated?.code) return updated.code;
      // Someone else just set it.
      const [again] = await db
        .select({ code: subscribers.referralCode })
        .from(subscribers)
        .where(eq(subscribers.id, subscriberId));
      if (again?.code) return again.code;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new Error("Couldn't create a referral code");
}

export const referralLink = (slug: string, code: string, domain?: string | null) =>
  `${publicationUrl(slug, domain)}?ref=${code}`;

/** The active reader behind a code, if the publication runs a referral program. */
export async function findReferrer(publicationId: string, code: string | undefined) {
  if (!code || !/^[a-z0-9]{6,12}$/.test(code)) return null;
  const [row] = await db
    .select({ id: subscribers.id, email: subscribers.email })
    .from(subscribers)
    .innerJoin(publications, eq(publications.id, subscribers.publicationId))
    .where(
      and(
        eq(subscribers.publicationId, publicationId),
        eq(subscribers.referralCode, code),
        eq(subscribers.status, "active"),
        eq(publications.referralsEnabled, true),
      ),
    );
  return row ?? null;
}

export async function listRewards(publicationId: string) {
  return db
    .select({
      id: referralRewards.id,
      threshold: referralRewards.threshold,
      name: referralRewards.name,
      description: referralRewards.description,
    })
    .from(referralRewards)
    .where(eq(referralRewards.publicationId, publicationId))
    .orderBy(asc(referralRewards.threshold));
}

/** How many confirmed readers someone brought. */
export async function referralCount(subscriberId: string) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(subscribers)
    .where(and(eq(subscribers.referredBy, subscriberId), eq(subscribers.status, "active")));
  return n;
}

/** What the reader sees: their link, how many they've brought, and the rewards. */
export async function referralSummary(subscriberId: string, publicationId: string, slug: string) {
  const [code, referred, rewards, [site]] = await Promise.all([
    ensureReferralCode(subscriberId),
    referralCount(subscriberId),
    listRewards(publicationId),
    db
      .select({
        customDomain: publications.customDomain,
        customDomainVerifiedAt: publications.customDomainVerifiedAt,
      })
      .from(publications)
      .where(eq(publications.id, publicationId)),
  ]);
  return {
    link: referralLink(slug, code, site ? liveDomain(site) : null),
    referred,
    rewards: rewards.map((r) => ({ ...r, reached: referred >= r.threshold })),
    next: rewards.find((r) => referred < r.threshold) ?? null,
  };
}

/**
 * After someone confirms: if they were referred, check whether their referrer just
 * reached a reward, and tell both sides. Safe to run twice (grants are unique).
 */
export async function creditReferral(confirmedSubscriberId: string) {
  const [row] = await db
    .select({ referrerId: subscribers.referredBy })
    .from(subscribers)
    .where(eq(subscribers.id, confirmedSubscriberId));
  if (!row?.referrerId) return;
  const [referrer] = await db
    .select({
      id: subscribers.id,
      email: subscribers.email,
      status: subscribers.status,
      unsubscribeToken: subscribers.unsubscribeToken,
      publicationId: publications.id,
      publicationName: publications.name,
      ownerId: publications.ownerId,
      enabled: publications.referralsEnabled,
    })
    .from(subscribers)
    .innerJoin(publications, eq(publications.id, subscribers.publicationId))
    .where(eq(subscribers.id, row.referrerId));
  if (!referrer || !referrer.enabled || referrer.status !== "active") return;

  const referred = await referralCount(referrer.id);
  const reached = await db
    .select()
    .from(referralRewards)
    .where(
      and(
        eq(referralRewards.publicationId, referrer.publicationId),
        sql`${referralRewards.threshold} <= ${referred}`,
      ),
    );
  for (const reward of reached) {
    const [granted] = await db
      .insert(referralGrants)
      .values({ subscriberId: referrer.id, rewardId: reward.id })
      .onConflictDoNothing()
      .returning({ rewardId: referralGrants.rewardId });
    if (!granted) continue;
    await sendNotice(referrer.email, `You earned: ${reward.name}`, {
      title: `You earned ${reward.name}!`,
      paragraphs: [
        `${referred} ${referred === 1 ? "person has" : "people have"} subscribed to ${referrer.publicationName} through your link. Thank you!`,
        reward.description || `The writer will be in touch about your ${reward.name}.`,
      ],
      action: {
        label: "See your referrals",
        url: absoluteUrl(`/unsubscribe/${referrer.unsubscribeToken}#refer`),
      },
    });
    await notifyUser(referrer.ownerId, `A reader earned “${reward.name}”`, {
      title: `${referrer.email} earned “${reward.name}”`,
      paragraphs: [
        `They've referred ${referred} confirmed ${referred === 1 ? "reader" : "readers"} to ${referrer.publicationName}.`,
        "Send them their reward. Reply to them directly from your email.",
      ],
      action: { label: "See the leaderboard", url: absoluteUrl("/dashboard/growth") },
    });
  }
}

/** Top referrers, with how many confirmed readers each brought. */
export async function leaderboard(publicationId: string, limit = 10) {
  const rows = await db.execute<{ email: string; referred: number }>(sql`
    select s.email, count(r.id)::int as referred
    from ${subscribers} s
    join ${subscribers} r on r.referred_by = s.id and r.status = 'active'
    where s.publication_id = ${publicationId}
    group by s.id, s.email
    order by referred desc, s.email
    limit ${limit}
  `);
  return rows.map((r) => ({ email: r.email, referred: r.referred }));
}
