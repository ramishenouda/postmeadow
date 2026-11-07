"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { publications } from "@/db/schema";
import { getPublicationForUser, requireUser } from "@/lib/dal";
import { isUniqueViolation } from "@/lib/db-errors";
import { firstErrors, newPublicationSchema } from "@/lib/publication-schema";

type Fields = keyof z.input<typeof newPublicationSchema>;

export type CreatePublicationState = {
  errors?: Partial<Record<Fields | "form", string>>;
  values?: Partial<Record<Fields, string>>;
};

export async function createPublication(
  _prev: CreatePublicationState,
  formData: FormData,
): Promise<CreatePublicationState> {
  const user = await requireUser();
  if (await getPublicationForUser(user.id)) redirect("/dashboard");

  const raw = {
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    description: String(formData.get("description") ?? ""),
    fromName: String(formData.get("fromName") ?? ""),
    replyTo: String(formData.get("replyTo") ?? ""),
  };

  const parsed = newPublicationSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: firstErrors(parsed.error), values: raw };
  }

  try {
    await db.insert(publications).values({ ...parsed.data, ownerId: user.id });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { errors: { slug: "That address is already taken. Pick another." }, values: raw };
    }
    console.error("createPublication failed", error);
    return { errors: { form: "Something went wrong. Try again." }, values: raw };
  }

  redirect("/dashboard");
}
