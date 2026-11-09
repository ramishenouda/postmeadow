"use server";

import { and, count, eq } from "drizzle-orm";
import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { landingPages, publications, recommendations, referralRewards } from "@/db/schema";
import { publicationTag } from "@/lib/cache-tags";
import { requirePublication } from "@/lib/dal";
import { isUniqueViolation } from "@/lib/db-errors";
import { MAX_RECOMMENDATIONS } from "@/lib/recommendations";
import { MAX_REWARDS } from "@/lib/referrals";
import { SLUG_PATTERN } from "@/lib/slug";
import { findOrCreateTags, TagError } from "@/lib/tags";

export type GrowthResult = { ok: true; message: string } | { ok: false; error: string };

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_LANDING_PAGES = 20;

async function done(slug: string, message: string): Promise<GrowthResult> {
  updateTag(publicationTag(slug));
  refresh();
  return { ok: true, message };
}

// ─── Referrals ───────────────────────────────────────────────────────────────

export async function setReferrals(enabled: boolean): Promise<GrowthResult> {
  const { publication } = await requirePublication("editor");
  await db
    .update(publications)
    .set({ referralsEnabled: enabled })
    .where(eq(publications.id, publication.id));
  return done(publication.slug, enabled ? "Referral program on." : "Referral program off.");
}

const rewardInput = z.object({
  threshold: z.coerce.number().int().min(1, "At least 1 referral").max(10_000),
  name: z.string().trim().min(1, "Name the reward").max(80),
  description: z
    .string()
    .trim()
    .max(300)
    .transform((v) => v || null),
});

export async function addReward(input: z.input<typeof rewardInput>): Promise<GrowthResult> {
  const { publication } = await requirePublication("editor");
  const parsed = rewardInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const [{ n }] = await db
    .select({ n: count() })
    .from(referralRewards)
    .where(eq(referralRewards.publicationId, publication.id));
  if (n >= MAX_REWARDS) return { ok: false, error: `Up to ${MAX_REWARDS} rewards.` };
  try {
    await db.insert(referralRewards).values({ publicationId: publication.id, ...parsed.data });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "There's already a reward at that number of referrals." };
    }
    throw error;
  }
  return done(publication.slug, `Reward “${parsed.data.name}” added.`);
}

export async function deleteReward(id: string): Promise<GrowthResult> {
  const { publication } = await requirePublication("editor");
  if (!UUID.test(id)) return { ok: false, error: "Not found." };
  await db
    .delete(referralRewards)
    .where(and(eq(referralRewards.id, id), eq(referralRewards.publicationId, publication.id)));
  return done(publication.slug, "Reward removed.");
}

// ─── Recommendations ─────────────────────────────────────────────────────────

/** "their-slug", "/their-slug" or a full link to their page. */
function slugFrom(input: string): string {
  const value = input.trim();
  try {
    const url = new URL(value);
    return url.pathname.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
  } catch {
    return value.replace(/^\/+/, "").split("/")[0].toLowerCase();
  }
}

export async function addRecommendation(target: string, note: string): Promise<GrowthResult> {
  const { publication } = await requirePublication("editor");
  const slug = slugFrom(target);
  const [other] = slug
    ? await db
        .select({ id: publications.id, name: publications.name })
        .from(publications)
        .where(eq(publications.slug, slug))
    : [];
  if (!other) return { ok: false, error: "No publication on Postmeadow at that address." };
  if (other.id === publication.id) return { ok: false, error: "That's your own publication." };
  const [{ n }] = await db
    .select({ n: count() })
    .from(recommendations)
    .where(eq(recommendations.publicationId, publication.id));
  if (n >= MAX_RECOMMENDATIONS) {
    return { ok: false, error: `Up to ${MAX_RECOMMENDATIONS} recommendations.` };
  }
  await db
    .insert(recommendations)
    .values({
      publicationId: publication.id,
      recommendedId: other.id,
      note: note.trim().slice(0, 200) || null,
    })
    .onConflictDoUpdate({
      target: [recommendations.publicationId, recommendations.recommendedId],
      set: { note: note.trim().slice(0, 200) || null },
    });
  return done(publication.slug, `You now recommend ${other.name}.`);
}

export async function removeRecommendation(id: string): Promise<GrowthResult> {
  const { publication } = await requirePublication("editor");
  if (!UUID.test(id)) return { ok: false, error: "Not found." };
  await db
    .delete(recommendations)
    .where(
      and(eq(recommendations.publicationId, publication.id), eq(recommendations.recommendedId, id)),
    );
  return done(publication.slug, "Recommendation removed.");
}

// ─── Landing pages ───────────────────────────────────────────────────────────

const landingInput = z.object({
  id: z.string().regex(UUID).optional().nullable(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_PATTERN, "Address: 3–40 lowercase letters, numbers and dashes"),
  headline: z.string().trim().min(1, "Write a headline").max(120),
  body: z.string().max(3000, "Keep the text under 3,000 characters"),
  buttonText: z
    .string()
    .trim()
    .max(30)
    .transform((v) => v || null),
  tag: z.string().trim().max(40),
});

export async function saveLandingPage(input: z.input<typeof landingInput>): Promise<GrowthResult> {
  const { publication } = await requirePublication("editor");
  const parsed = landingInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { id, tag, ...values } = parsed.data;
  let tagId: string | null = null;
  try {
    if (tag) tagId = (await findOrCreateTags(publication.id, [tag]))[0]?.id ?? null;
  } catch (error) {
    if (error instanceof TagError) return { ok: false, error: error.message };
    throw error;
  }
  try {
    if (id) {
      const updated = await db
        .update(landingPages)
        .set({ ...values, tagId })
        .where(and(eq(landingPages.id, id), eq(landingPages.publicationId, publication.id)))
        .returning({ id: landingPages.id });
      if (!updated.length) return { ok: false, error: "Landing page not found." };
    } else {
      const [{ n }] = await db
        .select({ n: count() })
        .from(landingPages)
        .where(eq(landingPages.publicationId, publication.id));
      if (n >= MAX_LANDING_PAGES) {
        return { ok: false, error: `Up to ${MAX_LANDING_PAGES} landing pages.` };
      }
      await db.insert(landingPages).values({ publicationId: publication.id, ...values, tagId });
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "Another landing page already uses that address." };
    }
    throw error;
  }
  return done(publication.slug, "Landing page saved.");
}

export async function deleteLandingPage(id: string): Promise<GrowthResult> {
  const { publication } = await requirePublication("editor");
  if (!UUID.test(id)) return { ok: false, error: "Not found." };
  await db
    .delete(landingPages)
    .where(and(eq(landingPages.id, id), eq(landingPages.publicationId, publication.id)));
  return done(publication.slug, "Landing page deleted.");
}

// ─── Pop-up ──────────────────────────────────────────────────────────────────

export async function savePopup(delaySeconds: number, headline: string): Promise<GrowthResult> {
  const { publication } = await requirePublication("editor");
  const delay = Math.round(Number(delaySeconds));
  if (!Number.isFinite(delay) || delay < 0 || delay > 120) {
    return { ok: false, error: "Pick a delay between 0 and 120 seconds." };
  }
  await db
    .update(publications)
    .set({ popupDelaySeconds: delay, popupHeadline: headline.trim().slice(0, 100) || null })
    .where(eq(publications.id, publication.id));
  return done(publication.slug, "Pop-up saved.");
}
