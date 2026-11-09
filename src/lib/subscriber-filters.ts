import "server-only";
import { and, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { subscribers, subscriberTags } from "@/db/schema";
import { SUBSCRIBER_STATES, subscriberStateWhere, type SubscriberState } from "@/lib/subscribers";

/** The subscriber list's filters, shared by the list and "tag everyone shown". */
export type SubscriberFilter = {
  q: string;
  /** A state, or "waiting": invited or unconfirmed (can still answer). */
  status?: SubscriberState | "waiting";
  /** A tag id. */
  tag?: string;
};

const UUID = /^[0-9a-f-]{36}$/i;

export function parseSubscriberFilter(params: Record<string, string | string[] | undefined>) {
  const status = String(params.status ?? "");
  const tag = String(params.tag ?? "");
  return {
    q: typeof params.q === "string" ? params.q.trim() : "",
    status:
      status === "waiting" || (SUBSCRIBER_STATES as readonly string[]).includes(status)
        ? (status as SubscriberState | "waiting")
        : undefined,
    tag: UUID.test(tag) ? tag : undefined,
  } satisfies SubscriberFilter;
}

export function subscriberFilterWhere(publicationId: string, f: SubscriberFilter): SQL {
  const filters: SQL[] = [eq(subscribers.publicationId, publicationId)];
  if (f.q) filters.push(ilike(subscribers.email, `%${f.q.replace(/[\\%_]/g, "\\$&")}%`));
  if (f.status === "waiting") {
    filters.push(or(subscriberStateWhere("invited"), subscriberStateWhere("unconfirmed"))!);
  } else if (f.status) {
    filters.push(subscriberStateWhere(f.status));
  }
  if (f.tag) {
    // Written out: drizzle's exists() doesn't parenthesise a raw subquery.
    filters.push(
      sql`exists (select 1 from ${subscriberTags} where ${subscriberTags.subscriberId} = ${subscribers.id} and ${subscriberTags.tagId} = ${f.tag})`,
    );
  }
  return and(...filters)!;
}
