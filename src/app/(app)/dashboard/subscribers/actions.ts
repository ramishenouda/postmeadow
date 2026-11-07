"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import Papa from "papaparse";
import { db } from "@/db";
import { subscribers } from "@/db/schema";
import { requirePublication } from "@/lib/dal";
import { emailSchema } from "@/lib/subscribers";
import { randomToken } from "@/lib/tokens";

export type AddSubscriberState = { ok?: boolean; error?: string; email?: string };

export async function addSubscriber(
  _prev: AddSubscriberState,
  formData: FormData,
): Promise<AddSubscriberState> {
  const { publication } = await requirePublication();
  const raw = String(formData.get("email") ?? "");
  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success) return { error: "Enter a valid email address.", email: raw };
  const email = parsed.data;

  const [existing] = await db
    .select({ status: subscribers.status })
    .from(subscribers)
    .where(and(eq(subscribers.publicationId, publication.id), eq(subscribers.email, email)))
    .limit(1);

  if (existing?.status === "active")
    return { error: `${email} is already subscribed.`, email: raw };
  if (existing?.status === "unsubscribed" || existing?.status === "bounced") {
    return {
      error: `${email} ${existing.status === "bounced" ? "bounced" : "unsubscribed"}. They need to subscribe again themselves.`,
      email: raw,
    };
  }

  const now = new Date();
  if (existing) {
    // Pending → the owner vouches for them.
    await db
      .update(subscribers)
      .set({ status: "active", confirmedAt: now, confirmToken: null })
      .where(and(eq(subscribers.publicationId, publication.id), eq(subscribers.email, email)));
  } else {
    await db
      .insert(subscribers)
      .values({
        publicationId: publication.id,
        email,
        status: "active",
        confirmedAt: now,
        unsubscribeToken: randomToken(),
      })
      .onConflictDoNothing();
  }
  refresh();
  return { ok: true };
}

export async function removeSubscriber(subscriberId: string) {
  const { publication } = await requirePublication();
  await db
    .delete(subscribers)
    .where(and(eq(subscribers.id, subscriberId), eq(subscribers.publicationId, publication.id)));
  refresh();
}

// ─── CSV import ──────────────────────────────────────────────────────────────

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_ROWS = 20_000;
const INSERT_CHUNK = 1_000;

export type ImportState = {
  error?: string;
  result?: { added: number; existing: number; invalid: number; invalidSamples: string[] };
};

export async function importSubscribers(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const { publication } = await requirePublication();

  if (formData.get("consent") !== "on") {
    return { error: "Confirm that everyone on the list agreed to receive your emails." };
  }

  const file = formData.get("file");
  const pasted = String(formData.get("pasted") ?? "");
  let text = pasted;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_IMPORT_BYTES) return { error: "The file is larger than 2 MB." };
    text = await file.text();
  }
  if (!text.trim()) return { error: "Choose a CSV file or paste some email addresses." };
  if (text.length > MAX_IMPORT_BYTES) return { error: "That's more than 2 MB of text." };

  const candidates = extractEmails(text);
  if (candidates.length > MAX_IMPORT_ROWS) {
    return { error: `Import at most ${MAX_IMPORT_ROWS.toLocaleString("en")} rows at a time.` };
  }

  const valid = new Set<string>();
  const invalidSamples: string[] = [];
  let invalid = 0;
  for (const candidate of candidates) {
    const parsed = emailSchema.safeParse(candidate);
    if (parsed.success) valid.add(parsed.data);
    else {
      invalid++;
      if (invalidSamples.length < 5) invalidSamples.push(candidate);
    }
  }

  const now = new Date();
  const emails = [...valid];
  let added = 0;
  for (let i = 0; i < emails.length; i += INSERT_CHUNK) {
    const rows = emails.slice(i, i + INSERT_CHUNK).map((email) => ({
      publicationId: publication.id,
      email,
      status: "active" as const,
      confirmedAt: now,
      unsubscribeToken: randomToken(),
    }));
    // Existing rows (including unsubscribed people) are left untouched.
    const inserted = await db
      .insert(subscribers)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: subscribers.id });
    added += inserted.length;
  }

  refresh();
  return { result: { added, existing: emails.length - added, invalid, invalidSamples } };
}

/**
 * Accepts a CSV with an "email" column, a CSV whose first column holds emails,
 * or a plain list separated by newlines, commas or semicolons.
 */
function extractEmails(text: string): string[] {
  const { data } = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
  if (data.length === 0) return [];

  const header = data[0].map((cell) => cell.trim().toLowerCase());
  const emailColumn = header.findIndex((cell) => /^e-?mail( address)?$/.test(cell));
  if (emailColumn >= 0) {
    return data
      .slice(1)
      .map((row) => row[emailColumn]?.trim() ?? "")
      .filter(Boolean);
  }

  // No header: take every cell that looks like it is meant to be an email.
  return data
    .flat()
    .flatMap((cell) => cell.split(/[\s,;]+/))
    .map((cell) => cell.trim())
    .filter((cell) => cell.includes("@"));
}
