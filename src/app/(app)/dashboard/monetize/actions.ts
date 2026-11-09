"use server";

import { eq } from "drizzle-orm";
import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { publications } from "@/db/schema";
import { publicationTag } from "@/lib/cache-tags";
import { requirePublication } from "@/lib/dal";
import {
  connectLink,
  expressDashboardUrl,
  PaidError,
  refreshAccount,
  savePrices,
} from "@/lib/paid";
import { reportError } from "@/lib/report";

export type EarnResult = { ok: true; message: string } | { ok: false; error: string };

const fail = (error: unknown, what: string): EarnResult => {
  if (error instanceof PaidError) return { ok: false, error: error.message };
  reportError(what, error);
  return { ok: false, error: "Stripe didn't answer as expected. Try again in a moment." };
};

export async function connectStripe(): Promise<EarnResult> {
  const { user, publication } = await requirePublication("owner");
  let url: string;
  try {
    url = await connectLink(publication, user.email);
  } catch (error) {
    return fail(error, "stripe connect failed");
  }
  redirect(url);
}

export async function refreshStripe(): Promise<EarnResult> {
  const { publication } = await requirePublication("owner");
  try {
    const enabled = await refreshAccount(publication);
    updateTag(publicationTag(publication.slug));
    refresh();
    return enabled
      ? { ok: true, message: "Your Stripe account can take payments." }
      : { ok: false, error: "Stripe still needs a few details. Continue the setup." };
  } catch (error) {
    return fail(error, "stripe refresh failed");
  }
}

export async function openPayouts(): Promise<EarnResult> {
  const { publication } = await requirePublication("owner");
  let url: string;
  try {
    url = await expressDashboardUrl(publication);
  } catch (error) {
    return fail(error, "stripe login link failed");
  }
  redirect(url);
}

/** "9" or "9.50" → 900 / 950; empty → null. */
const cents = (value: string) => {
  const v = value.trim().replace(",", ".");
  if (!v) return null;
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(v)) return NaN;
  return Math.round(Number(v) * 100);
};

export async function savePaidSettings(input: {
  currency: string;
  monthly: string;
  yearly: string;
  description: string;
}): Promise<EarnResult> {
  const { publication } = await requirePublication("owner");
  const monthlyCents = cents(input.monthly);
  const yearlyCents = cents(input.yearly);
  if (Number.isNaN(monthlyCents) || Number.isNaN(yearlyCents)) {
    return { ok: false, error: "Write prices as numbers, like 8 or 7.50." };
  }
  try {
    await savePrices(publication, {
      currency: input.currency,
      monthlyCents,
      yearlyCents,
      description: input.description,
    });
  } catch (error) {
    return fail(error, "saving prices failed");
  }
  updateTag(publicationTag(publication.slug));
  refresh();
  return { ok: true, message: "Prices saved." };
}

export async function setPaidEnabled(enabled: boolean): Promise<EarnResult> {
  const { publication } = await requirePublication("owner");
  if (
    enabled &&
    (!publication.stripeChargesEnabled ||
      !(publication.paidMonthlyPriceId || publication.paidYearlyPriceId))
  ) {
    return { ok: false, error: "Connect Stripe and set your prices first." };
  }
  await db
    .update(publications)
    .set({ paidEnabled: enabled })
    .where(eq(publications.id, publication.id));
  updateTag(publicationTag(publication.slug));
  refresh();
  return {
    ok: true,
    message: enabled
      ? "Paid subscriptions are open. Readers see “Upgrade” on your page."
      : "Paid subscriptions are closed to new readers. Current ones keep paying until they cancel.",
  };
}
