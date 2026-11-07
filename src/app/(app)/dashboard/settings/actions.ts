"use server";

import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db } from "@/db";
import { publications } from "@/db/schema";
import { publicationTag } from "@/lib/cache-tags";
import { requirePublication } from "@/lib/dal";
import { firstErrors, publicationSettingsSchema } from "@/lib/publication-schema";

export type SettingsState = {
  ok?: boolean;
  errors?: Record<string, string>;
  /** Echoed back on error so the form keeps what was typed. */
  values?: Record<string, string>;
};

export async function updateSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { publication } = await requirePublication();
  const raw = {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    fromName: String(formData.get("fromName") ?? ""),
    replyTo: String(formData.get("replyTo") ?? ""),
  };
  const parsed = publicationSettingsSchema.safeParse(raw);
  if (!parsed.success) return { errors: firstErrors(parsed.error), values: raw };

  await db.update(publications).set(parsed.data).where(eq(publications.id, publication.id));
  // Public pages show the name and description.
  updateTag(publicationTag(publication.slug));
  return { ok: true };
}
