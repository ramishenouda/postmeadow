"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { after } from "next/server";
import Papa from "papaparse";
import { db } from "@/db";
import { subscribers } from "@/db/schema";
import { requirePublication } from "@/lib/dal";
import { canRemove, emailSchema } from "@/lib/subscribers";
import { createInvitations, inviteOne, sendInvitations } from "@/lib/invitations";
import { randomToken } from "@/lib/tokens";

export type AddSubscriberState = { ok?: boolean; error?: string; email?: string };

/**
 * "Add a subscriber" sends an invitation: the person is only subscribed once they
 * accept (see src/lib/invitations.ts).
 */
export async function addSubscriber(
  _prev: AddSubscriberState,
  formData: FormData,
): Promise<AddSubscriberState> {
  const { publication } = await requirePublication();
  const raw = String(formData.get("email") ?? "");
  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success) return { error: "Enter a valid email address.", email: raw };

  try {
    const result = await inviteOne(publication, parsed.data);
    if (!result.ok) return { error: result.error, email: raw };
  } catch (error) {
    console.error("invitation failed", error);
    return { error: "We couldn't send the invitation. Try again in a moment.", email: raw };
  }
  refresh();
  return { ok: true, email: parsed.data };
}

/** Re-send an invitation that expired unanswered. */
export async function inviteAgain(subscriberId: string): Promise<{ ok: boolean; error?: string }> {
  const { publication } = await requirePublication();
  const [row] = await db
    .select({ email: subscribers.email })
    .from(subscribers)
    .where(and(eq(subscribers.id, subscriberId), eq(subscribers.publicationId, publication.id)))
    .limit(1);
  if (!row) return { ok: false, error: "Subscriber not found." };
  try {
    const result = await inviteOne(publication, row.email);
    if (!result.ok) return result;
  } catch (error) {
    console.error("invitation failed", error);
    return { ok: false, error: "We couldn't send the invitation. Try again in a moment." };
  }
  refresh();
  return { ok: true };
}

export async function removeSubscriber(subscriberId: string) {
  const { publication } = await requirePublication();
  const [row] = await db
    .select({ status: subscribers.status, invitedAt: subscribers.invitedAt })
    .from(subscribers)
    .where(and(eq(subscribers.id, subscriberId), eq(subscribers.publicationId, publication.id)));
  if (!row || !canRemove(row)) return;
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
  result?: {
    /** "subscribed": added as confirmed. "invited": sent invitations instead. */
    mode: "subscribed" | "invited";
    added: number;
    existing: number;
    invalid: number;
    invalidSamples: string[];
  };
};

export async function importSubscribers(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const { publication } = await requirePublication();
  const mode = formData.get("mode") === "invite" ? "invited" : "subscribed";

  // Adding people as subscribed skips the invitation, so the writer vouches for them.
  if (mode === "subscribed" && formData.get("consent") !== "on") {
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

  const emails = [...valid];

  if (mode === "invited") {
    const created = await createInvitations(publication, emails);
    if (!created.ok) return { error: created.error };
    // Respond now; the emails go out in batches afterwards.
    after(() =>
      sendInvitations(publication, created.invited).catch((e) =>
        console.error("invitations failed", e),
      ),
    );
    refresh();
    return {
      result: {
        mode,
        added: created.invited.length,
        existing: created.existing,
        invalid,
        invalidSamples,
      },
    };
  }

  const now = new Date();
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
  return { result: { mode, added, existing: emails.length - added, invalid, invalidSamples } };
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
