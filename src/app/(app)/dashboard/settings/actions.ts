"use server";

import { eq } from "drizzle-orm";
import { refresh, updateTag } from "next/cache";
import { db } from "@/db";
import { publications } from "@/db/schema";
import { publicationTag } from "@/lib/cache-tags";
import { requirePublication } from "@/lib/dal";
import { deleteImage, ownsImageUrl } from "@/lib/images/service";
import { ImageError } from "@/lib/images/process";
import { firstErrors, publicationSettingsSchema } from "@/lib/publication-schema";
import { MAX_WELCOME_MESSAGE } from "@/lib/welcome-default";
import { isEmailDesign } from "@/lib/email-designs";

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
  const { user, publication } = await requirePublication();
  const raw = {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    fromName: String(formData.get("fromName") ?? ""),
    replyTo: String(formData.get("replyTo") ?? ""),
    logoUrl: String(formData.get("logoUrl") ?? ""),
    accentColor: String(formData.get("accentColor") ?? ""),
    fontStyle: String(formData.get("fontStyle") ?? "sans"),
    welcomeEnabled: formData.get("welcomeEnabled") === "on" ? "on" : "",
    welcomeMessage: String(formData.get("welcomeMessage") ?? ""),
    emailDesign: String(formData.get("emailDesign") ?? "classic"),
  };
  const parsed = publicationSettingsSchema.safeParse(raw);
  if (!parsed.success) return { errors: firstErrors(parsed.error), values: raw };
  const welcomeMessage = raw.welcomeMessage.trim();
  if (welcomeMessage.length > MAX_WELCOME_MESSAGE) {
    return {
      errors: { welcomeMessage: `Keep it under ${MAX_WELCOME_MESSAGE} characters.` },
      values: raw,
    };
  }
  if (!isEmailDesign(raw.emailDesign)) {
    return { errors: { emailDesign: "Pick one of the designs." }, values: raw };
  }
  if (parsed.data.logoUrl && !(await ownsImageUrl(user.id, parsed.data.logoUrl))) {
    return {
      errors: { logoUrl: "Upload the logo here; links to other sites can't be used." },
      values: raw,
    };
  }

  await db
    .update(publications)
    .set({
      ...parsed.data,
      welcomeEnabled: raw.welcomeEnabled === "on",
      welcomeMessage: welcomeMessage || null,
      emailDesign: raw.emailDesign,
    })
    .where(eq(publications.id, publication.id));
  // Public pages show the name and description.
  updateTag(publicationTag(publication.slug));
  return { ok: true };
}

export type DeleteImageResult = { ok: true } | { ok: false; error: string };

export async function deleteUploadedImage(imageId: string): Promise<DeleteImageResult> {
  const { user } = await requirePublication();
  try {
    await deleteImage(user.id, imageId);
  } catch (error) {
    if (error instanceof ImageError) return { ok: false, error: error.message };
    throw error;
  }
  refresh();
  return { ok: true };
}
