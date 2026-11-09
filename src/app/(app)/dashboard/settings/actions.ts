"use server";

import { eq } from "drizzle-orm";
import { refresh, updateTag } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { AccountError, deleteAccount } from "@/lib/account";
import { auth } from "@/lib/auth";
import { APP_NAME } from "@/lib/brand";
import { sendNotice } from "@/lib/notify";
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
  const { publication } = await requirePublication("editor");
  const raw = {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    fromName: String(formData.get("fromName") ?? ""),
    replyTo: String(formData.get("replyTo") ?? ""),
    // Not in the form (an older page, a script): keep the saved address.
    postalAddress: formData.has("postalAddress")
      ? String(formData.get("postalAddress"))
      : (publication.postalAddress ?? ""),
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
  if (parsed.data.logoUrl && !(await ownsImageUrl(publication.ownerId, parsed.data.logoUrl))) {
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
      // The checkbox is only judged when the form had it (older forms keep the setting).
      commentsEnabled: formData.has("commentsShown")
        ? formData.get("commentsEnabled") === "on"
        : publication.commentsEnabled,
      emailDesign: raw.emailDesign,
    })
    .where(eq(publications.id, publication.id));
  // Public pages show the name and description.
  updateTag(publicationTag(publication.slug));
  return { ok: true };
}

export type DeleteImageResult = { ok: true } | { ok: false; error: string };

export async function deleteUploadedImage(imageId: string): Promise<DeleteImageResult> {
  const { publication } = await requirePublication("editor");
  try {
    await deleteImage(publication.ownerId, imageId);
  } catch (error) {
    if (error instanceof ImageError) return { ok: false, error: error.message };
    throw error;
  }
  refresh();
  return { ok: true };
}

/**
 * Deletes the account and everything in it. The writer confirms by typing their
 * publication's web address, so it can't happen by a stray click.
 */
export async function deleteMyAccount(confirmation: string): Promise<{ ok: false; error: string }> {
  const { user, publication } = await requirePublication("owner");
  if (confirmation.trim().toLowerCase() !== publication.slug) {
    return { ok: false, error: `Type ${publication.slug} to confirm.` };
  }

  const requestHeaders = await headers();
  try {
    const { slugs } = await deleteAccount(user.id);
    for (const slug of slugs) updateTag(publicationTag(slug));
  } catch (error) {
    if (error instanceof AccountError) return { ok: false, error: error.message };
    throw error;
  }
  // Clear the browser's sign-in cookie (the session itself went with the account).
  await auth.api.signOut({ headers: requestHeaders }).catch(() => {});

  after(() =>
    sendNotice(user.email, `Your ${APP_NAME} account has been deleted`, {
      title: "Your account has been deleted",
      paragraphs: [
        `Your ${APP_NAME} account, your publication, posts, subscribers and uploaded images have been deleted. Any paid plan has been cancelled.`,
        "Thanks for writing with us. If this wasn't you, reply to this email right away.",
      ],
    }),
  );
  redirect("/account-deleted");
}
