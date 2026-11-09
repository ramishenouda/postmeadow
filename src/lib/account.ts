import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { accountBilling, images, posts, publications } from "@/db/schema";
import { getStripe } from "@/lib/billing/stripe";
import { getStorage } from "@/lib/storage";

export class AccountError extends Error {}

/**
 * Deletes an account and everything in it, straight away (the privacy policy says so):
 * publications, subscribers, posts, templates, tags and uploaded files; the Stripe
 * customer, which also ends any subscription; and the sign-in records.
 * Refuses while a send is running, so no half-sent issue is left behind.
 */
export async function deleteAccount(userId: string) {
  const owned = await db
    .select({ id: publications.id, slug: publications.slug })
    .from(publications)
    .where(eq(publications.ownerId, userId));

  if (owned.length > 0) {
    const [sending] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          inArray(
            posts.publicationId,
            owned.map((p) => p.id),
          ),
          eq(posts.status, "sending"),
        ),
      )
      .limit(1);
    if (sending) {
      throw new AccountError("A post is being sent right now. Try again when it's finished.");
    }
  }

  // Stripe first: if it fails, nothing is deleted yet and the writer can retry.
  const [billing] = await db
    .select({ customer: accountBilling.stripeCustomerId })
    .from(accountBilling)
    .where(eq(accountBilling.userId, userId));
  const stripe = getStripe();
  if (billing?.customer && stripe) {
    try {
      // Deleting the customer cancels their subscriptions immediately.
      await stripe.customers.del(billing.customer);
    } catch (error) {
      if ((error as { code?: string }).code !== "resource_missing") throw error;
    }
  }

  const files = await db.select({ key: images.key }).from(images).where(eq(images.ownerId, userId));

  // Everything else hangs off the user row and goes with it (ON DELETE CASCADE).
  await db.delete(user).where(eq(user.id, userId));

  const storage = getStorage();
  for (const { key } of files) {
    await storage.delete(key).catch((e) => console.error("could not delete file", key, e));
  }
  return { slugs: owned.map((p) => p.slug) };
}
