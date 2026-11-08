import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { accountBilling, images, posts, publications } from "@/db/schema";
import { formatBytes, isPlanId, PLANS, storageLimit } from "@/lib/plans";
import { getStorage } from "@/lib/storage";
import { mediaUrl } from "@/lib/urls";
import { ImageError, processImage } from "./process";

export async function storageUsage(userId: string) {
  const [[billing], [usage]] = await Promise.all([
    db.select().from(accountBilling).where(eq(accountBilling.userId, userId)),
    db
      .select({ used: sql<number>`coalesce(sum(${images.bytes}), 0)::bigint` })
      .from(images)
      .where(eq(images.ownerId, userId)),
  ]);
  const plan = billing?.plan ?? "free";
  return {
    plan,
    planName: isPlanId(plan) ? PLANS[plan].name : PLANS.free.name,
    used: Number(usage.used),
    limit: storageLimit(plan, billing?.storageAddons ?? 0),
  };
}

/** Processes, stores and records an upload. Throws ImageError for anything the user can fix. */
export async function saveImage(userId: string, input: Buffer, originalName: string | null) {
  const processed = await processImage(input);
  const id = randomUUID();
  const key = `images/${id}.${processed.extension}`;
  const storage = getStorage();

  await db.transaction(async (tx) => {
    // Serialise uploads per account so two at once can't both squeeze under the limit.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`storage:${userId}`}))`);
    const usage = await storageUsage(userId);
    if (usage.used + processed.body.byteLength > usage.limit) {
      throw new ImageError(
        `Not enough storage: you've used ${formatBytes(usage.used)} of ${formatBytes(usage.limit)} on the ${usage.planName} plan. Delete unused images in Settings, or upgrade.`,
        413,
      );
    }
    await storage.put(key, processed.body, processed.contentType);
    try {
      await tx.insert(images).values({
        id,
        ownerId: userId,
        key,
        contentType: processed.contentType,
        bytes: processed.body.byteLength,
        width: processed.width,
        height: processed.height,
        originalName: originalName?.slice(0, 200) ?? null,
      });
    } catch (error) {
      await storage.delete(key);
      throw error;
    }
  });

  return {
    id,
    url: mediaUrl(key),
    width: processed.width,
    height: processed.height,
    bytes: processed.body.byteLength,
  };
}

/**
 * Images that already went out in an email (or are the publication's logo) must
 * keep working, so they can't be deleted.
 */
async function inUse(userId: string, urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  const rows = await db
    .select({ content: posts.content, logo: publications.logoUrl })
    .from(publications)
    .leftJoin(
      posts,
      and(eq(posts.publicationId, publications.id), inArray(posts.status, ["sending", "sent"])),
    )
    .where(eq(publications.ownerId, userId));
  const used = new Set<string>();
  for (const url of urls) {
    if (rows.some((r) => r.logo === url || (r.content ?? "").includes(url))) used.add(url);
  }
  return used;
}

export async function listImages(userId: string) {
  const rows = await db
    .select()
    .from(images)
    .where(eq(images.ownerId, userId))
    .orderBy(desc(images.createdAt));
  const withUrls = rows.map((r) => ({ ...r, url: mediaUrl(r.key) }));
  const used = await inUse(
    userId,
    withUrls.map((r) => r.url),
  );
  return withUrls.map((r) => ({ ...r, inUse: used.has(r.url) }));
}

export async function deleteImage(userId: string, imageId: string) {
  const [image] = await db
    .select()
    .from(images)
    .where(and(eq(images.id, imageId), eq(images.ownerId, userId)));
  if (!image) throw new ImageError("Image not found.", 404);
  if ((await inUse(userId, [mediaUrl(image.key)])).size > 0) {
    throw new ImageError(
      "This image is in an email you've sent (or is your logo), so it has to stay.",
      409,
    );
  }
  await db.delete(images).where(eq(images.id, image.id));
  await getStorage().delete(image.key);
}

/** True if `url` is one of this account's uploaded images (used to validate logos). */
export async function ownsImageUrl(userId: string, url: string): Promise<boolean> {
  const prefix = mediaUrl("");
  if (!url.startsWith(prefix)) return false;
  const [row] = await db
    .select({ id: images.id })
    .from(images)
    .where(and(eq(images.ownerId, userId), eq(images.key, url.slice(prefix.length))));
  return Boolean(row);
}
