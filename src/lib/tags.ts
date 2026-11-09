import "server-only";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { postAudienceTags, posts, subscribers, subscriberTags, tags } from "@/db/schema";

/**
 * Tags label subscribers ("customers", "beta", "berlin"…). A post can go to
 * everyone, or only to active subscribers with any of its audience tags: that's a
 * segment. Names are unique per publication, ignoring case.
 */

export const MAX_TAG_LENGTH = 40;
export const MAX_TAGS = 100;

/** Trimmed, single-spaced, at most MAX_TAG_LENGTH; empty means "not a tag". */
export function cleanTagName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH);
}

/** Comma- or newline-separated names, cleaned and de-duplicated (ignoring case). */
export function parseTagNames(input: string | string[]): string[] {
  const parts = (Array.isArray(input) ? input : input.split(/[,\n]/)).map(cleanTagName);
  const seen = new Set<string>();
  return parts.filter((p) => p && !seen.has(p.toLowerCase()) && seen.add(p.toLowerCase()));
}

export type TagSummary = { id: string; name: string; active: number };

/** All tags with how many active subscribers have each. */
export async function listTags(publicationId: string): Promise<TagSummary[]> {
  return db
    .select({
      id: tags.id,
      name: tags.name,
      active: sql<number>`count(${subscribers.id}) filter (where ${subscribers.status} = 'active')::int`,
    })
    .from(tags)
    .leftJoin(subscriberTags, eq(subscriberTags.tagId, tags.id))
    .leftJoin(subscribers, eq(subscribers.id, subscriberTags.subscriberId))
    .where(eq(tags.publicationId, publicationId))
    .groupBy(tags.id)
    .orderBy(asc(sql`lower(${tags.name})`));
}

export class TagError extends Error {}

/** The tags with these names, creating any that don't exist (up to MAX_TAGS in total). */
export async function findOrCreateTags(publicationId: string, names: string[]) {
  const wanted = parseTagNames(names);
  if (wanted.length === 0) return [];
  const existing = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(eq(tags.publicationId, publicationId));
  const byName = new Map(existing.map((t) => [t.name.toLowerCase(), t]));
  const missing = wanted.filter((n) => !byName.has(n.toLowerCase()));
  if (existing.length + missing.length > MAX_TAGS) {
    throw new TagError(`You can have up to ${MAX_TAGS} tags. Delete some you don't use first.`);
  }
  if (missing.length > 0) {
    await db
      .insert(tags)
      .values(missing.map((name) => ({ publicationId, name })))
      .onConflictDoNothing();
    const again = await db
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(eq(tags.publicationId, publicationId));
    for (const t of again) byName.set(t.name.toLowerCase(), t);
  }
  return wanted.map((n) => byName.get(n.toLowerCase())!).filter(Boolean);
}

/** Only tags that already exist (public sign-up forms can't create tags). */
export async function findTags(publicationId: string, names: string[]) {
  const wanted = parseTagNames(names).map((n) => n.toLowerCase());
  if (wanted.length === 0) return [];
  return db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(and(eq(tags.publicationId, publicationId), inArray(sql`lower(${tags.name})`, wanted)));
}

/** Add tags to subscribers (by id). Existing pairs are left alone. */
export async function addTags(subscriberIds: string[], tagIds: string[]) {
  const rows = subscriberIds.flatMap((subscriberId) =>
    tagIds.map((tagId) => ({ subscriberId, tagId })),
  );
  for (let i = 0; i < rows.length; i += 5_000) {
    await db
      .insert(subscriberTags)
      .values(rows.slice(i, i + 5_000))
      .onConflictDoNothing();
  }
}

/** Tags per subscriber, for showing them in the list. */
export async function tagsBySubscriber(subscriberIds: string[]) {
  const map = new Map<string, { id: string; name: string }[]>();
  if (subscriberIds.length === 0) return map;
  const rows = await db
    .select({ subscriberId: subscriberTags.subscriberId, id: tags.id, name: tags.name })
    .from(subscriberTags)
    .innerJoin(tags, eq(tags.id, subscriberTags.tagId))
    .where(inArray(subscriberTags.subscriberId, subscriberIds))
    .orderBy(asc(sql`lower(${tags.name})`));
  for (const r of rows) {
    const list = map.get(r.subscriberId) ?? [];
    list.push({ id: r.id, name: r.name });
    map.set(r.subscriberId, list);
  }
  return map;
}

/** A post's audience: everyone, or the tags it goes to. */
export async function postAudience(postId: string) {
  const [post] = await db
    .select({ audience: posts.audience })
    .from(posts)
    .where(eq(posts.id, postId));
  const tagRows = await db
    .select({ id: tags.id, name: tags.name })
    .from(postAudienceTags)
    .innerJoin(tags, eq(tags.id, postAudienceTags.tagId))
    .where(eq(postAudienceTags.postId, postId))
    .orderBy(asc(sql`lower(${tags.name})`));
  return {
    mode: post?.audience === "tags" ? ("tags" as const) : ("everyone" as const),
    tags: tagRows,
  };
}

/** How many active subscribers a send to these tags (or everyone) would reach. */
export async function countAudience(publicationId: string, tagIds: string[] | null) {
  if (tagIds === null) {
    const [{ n }] = await db
      .select({ n: count() })
      .from(subscribers)
      .where(and(eq(subscribers.publicationId, publicationId), eq(subscribers.status, "active")));
    return n;
  }
  if (tagIds.length === 0) return 0;
  const [{ n }] = await db
    .select({ n: sql<number>`count(distinct ${subscribers.id})::int` })
    .from(subscribers)
    .innerJoin(subscriberTags, eq(subscriberTags.subscriberId, subscribers.id))
    .where(
      and(
        eq(subscribers.publicationId, publicationId),
        eq(subscribers.status, "active"),
        inArray(subscriberTags.tagId, tagIds),
      ),
    );
  return n;
}
