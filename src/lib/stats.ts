import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";

/**
 * Audience stats: where readers come from, which posts bring them, how engaged
 * they are, and how each issue did.
 */

/** How many recent issues engagement looks at. */
export const RECENT_ISSUES = 5;

export const ENGAGEMENT_LEVELS = ["engaged", "occasional", "dormant", "new"] as const;
export type EngagementLevel = (typeof ENGAGEMENT_LEVELS)[number];

export const ENGAGEMENT_LABELS: Record<EngagementLevel, { label: string; note: string }> = {
  engaged: { label: "Engaged", note: "opened at least half of the recent issues they got" },
  occasional: { label: "Occasional", note: "opened some, but fewer than half" },
  dormant: { label: "Dormant", note: "got 2 or more recent issues and opened none" },
  new: { label: "Too new to tell", note: "got fewer than 2 recent issues" },
};

/**
 * A subscriber's engagement level, from the publication's last RECENT_ISSUES sent
 * issues (resends excluded). Opens include clicks (a click sets opened_at).
 * Written against the outer `subscribers` row, for WHERE clauses and selects.
 */
export function engagementLevelSql(): SQL<EngagementLevel> {
  return sql<EngagementLevel>`(
    select case
      when count(*) > 0 and count(d.opened_at) * 2 >= count(*) then 'engaged'
      when count(d.opened_at) > 0 then 'occasional'
      when count(*) >= 2 then 'dormant'
      else 'new'
    end
    from deliveries d
    where d.subscriber_id = "subscribers"."id"
      and d.status in ('sent', 'complained')
      and d.post_id in (
        select p.id from posts p
        where p.publication_id = "subscribers"."publication_id"
          and p.status = 'sent' and p.resend_of is null
        order by p.published_at desc
        limit ${RECENT_ISSUES}
      )
  )`;
}

export async function engagementBreakdown(publicationId: string) {
  const rows = await db.execute<{ level: EngagementLevel; n: number }>(sql`
    select ${engagementLevelSql()} as level, count(*)::int as n
    from subscribers
    where publication_id = ${publicationId} and status = 'active'
    group by 1
  `);
  const out: Record<EngagementLevel, number> = { engaged: 0, occasional: 0, dormant: 0, new: 0 };
  for (const r of rows) out[r.level] = r.n;
  return out;
}

export type SourceRow = { key: string; label: string; n: number };

/** Readers who confirmed in the last `days` days (still subscribed), by where they came from. */
export async function readerSources(publicationId: string, days: number): Promise<SourceRow[]> {
  const rows = await db.execute<{ key: string; n: number }>(sql`
    select case
        when source = 'signup' and signup_post_id is not null then 'post'
        else source
      end as key,
      count(*)::int as n
    from subscribers
    where publication_id = ${publicationId} and status = 'active'
      and confirmed_at >= now() - make_interval(days => ${days})
    group by 1
    order by 2 desc
  `);
  const labels: Record<string, string> = {
    signup: "Your page and sign-up forms",
    post: "Post pages",
    invite: "Invitations",
    import: "Imports",
    referral: "Referrals",
    recommendation: "Recommendations",
  };
  return rows.map((r) => ({ key: r.key, label: labels[r.key] ?? r.key, n: r.n }));
}

export type PostPerformance = {
  id: string;
  title: string;
  publishedAt: Date | null;
  delivered: number;
  openRate: number;
  clickRate: number;
  newReaders: number;
  likes: number;
  comments: number;
};

/** The last `limit` sent issues with their numbers. */
export async function postPerformance(
  publicationId: string,
  limit = 10,
): Promise<PostPerformance[]> {
  const rows = await db.execute<{
    id: string;
    title: string;
    published_at: string | null;
    delivered: number;
    opened: number;
    clicked: number;
    new_readers: number;
    likes: number;
    comments: number;
  }>(sql`
    select p.id, p.title, p.published_at,
      (select count(*) from deliveries d where d.post_id = p.id and d.status in ('sent','complained'))::int as delivered,
      (select count(d.opened_at) from deliveries d where d.post_id = p.id)::int as opened,
      (select count(d.clicked_at) from deliveries d where d.post_id = p.id)::int as clicked,
      (select count(*) from subscribers s where s.signup_post_id = p.id and s.status = 'active')::int as new_readers,
      (select count(*) from post_likes l where l.post_id = p.id)::int as likes,
      (select count(*) from comments c where c.post_id = p.id and c.status = 'published')::int as comments
    from posts p
    where p.publication_id = ${publicationId} and p.status = 'sent' and p.resend_of is null
    order by p.published_at desc
    limit ${limit}
  `);
  const rate = (n: number, of: number) => (of ? Math.round((n / of) * 1000) / 10 : 0);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    publishedAt: r.published_at ? new Date(r.published_at) : null,
    delivered: r.delivered,
    openRate: rate(r.opened, r.delivered),
    clickRate: rate(r.clicked, r.delivered),
    newReaders: r.new_readers,
    likes: r.likes,
    comments: r.comments,
  }));
}

/** Readers gained and lost in the last `days` days. */
export async function churn(publicationId: string, days: number) {
  const [row] = await db.execute<{ gained: number; lost: number; paused: number }>(sql`
    select
      count(*) filter (where confirmed_at >= now() - make_interval(days => ${days}) and status = 'active')::int as gained,
      count(*) filter (where unsubscribed_at >= now() - make_interval(days => ${days}) and status = 'unsubscribed')::int as lost,
      count(*) filter (where status = 'active' and paused_until > now())::int as paused
    from subscribers where publication_id = ${publicationId}
  `);
  return row;
}
