import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";

export type RateLimit = { limit: number; windowSeconds: number };

/**
 * Counts one attempt for `key` and reports whether it is within the limit.
 * Fixed window, stored in Postgres so every app instance shares the counters.
 * A single atomic upsert, so concurrent requests can't both slip under the limit.
 */
export async function hit(key: string, { limit, windowSeconds }: RateLimit): Promise<boolean> {
  const [row] = await db.execute<{ count: number }>(sql`
    insert into ${rateLimits} (key, window_start, count)
    values (${key}, now(), 1)
    on conflict (key) do update set
      count = case
        when ${rateLimits.windowStart} <= now() - make_interval(secs => ${windowSeconds}) then 1
        else ${rateLimits.count} + 1
      end,
      window_start = case
        when ${rateLimits.windowStart} <= now() - make_interval(secs => ${windowSeconds}) then now()
        else ${rateLimits.windowStart}
      end
    returning count
  `);

  // Housekeeping: occasionally drop counters nobody has touched for a day.
  if (Math.random() < 0.01) {
    await db.execute(sql`delete from ${rateLimits} where window_start < now() - interval '1 day'`);
  }

  return Number(row.count) <= limit;
}

export class RateLimitError extends Error {
  constructor(message = "Too many attempts. Try again in a few minutes.") {
    super(message);
    this.name = "RateLimitError";
  }
}
