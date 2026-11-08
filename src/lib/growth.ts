import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export type GrowthPoint = {
  /** "YYYY-MM-DD" (UTC day) */
  day: string;
  /** Confirmed subscribers at the end of the day. */
  total: number;
  gained: number;
  lost: number;
};

/**
 * Subscribers per day for the last `days` days (UTC). A subscriber counts from
 * their confirmation until they unsubscribe; someone who unsubscribed and later
 * confirmed again counts again. Bounced addresses and unconfirmed sign-ups don't count.
 */
export async function subscriberGrowth(publicationId: string, days = 30): Promise<GrowthPoint[]> {
  const rows = await db.execute<{ day: string; total: number; gained: number; lost: number }>(sql`
    with days as (
      select d::date as day, d + interval '1 day' as day_end
      from generate_series(
        date_trunc('day', now() at time zone 'utc') - make_interval(days => ${days - 1}),
        date_trunc('day', now() at time zone 'utc'),
        interval '1 day'
      ) d
    ),
    subs as (
      select confirmed_at at time zone 'utc' as confirmed,
             -- An unsubscribe before the latest confirmation was undone by re-subscribing.
             case when unsubscribed_at > confirmed_at then unsubscribed_at at time zone 'utc' end as left_at
      from subscribers
      where publication_id = ${publicationId}
        and confirmed_at is not null
        and status <> 'bounced'
    )
    select to_char(days.day, 'YYYY-MM-DD') as day,
      (select count(*) from subs where confirmed < day_end and (left_at is null or left_at >= day_end))::int as total,
      (select count(*) from subs where confirmed >= days.day and confirmed < day_end)::int as gained,
      (select count(*) from subs where left_at >= days.day and left_at < day_end)::int as lost
    from days
    order by days.day
  `);
  return rows.map((r) => ({ ...r }));
}
