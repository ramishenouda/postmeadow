"use server";

import { and, eq, ne } from "drizzle-orm";
import { refresh, updateTag } from "next/cache";
import { db } from "@/db";
import { publications } from "@/db/schema";
import { getBilling } from "@/lib/billing/service";
import { publicationTag } from "@/lib/cache-tags";
import { requirePublication } from "@/lib/dal";
import { dnsPointsHere, normalizeDomain } from "@/lib/domains";
import { domainProvider } from "@/lib/email/sender-domains";
import { allowsCustomDomains } from "@/lib/plans";
import { reportError } from "@/lib/report";
import { emailSchema } from "@/lib/subscribers";

export type DomainResult = { ok: true; message: string } | { ok: false; error: string };

const UPGRADE = "Your own domains come with the Pro and Business plans. Upgrade in Billing.";

async function editor() {
  const { publication } = await requirePublication("editor");
  const billing = await getBilling(publication.ownerId);
  return { publication, allowed: allowsCustomDomains(billing?.plan ?? "free") };
}

// ─── Web address ─────────────────────────────────────────────────────────────

export async function setCustomDomain(input: string): Promise<DomainResult> {
  const { publication, allowed } = await editor();
  if (!allowed) return { ok: false, error: UPGRADE };
  const domain = normalizeDomain(input);
  if (!domain) return { ok: false, error: "Enter a domain like news.yourbrand.com" };
  const [taken] = await db
    .select({ id: publications.id })
    .from(publications)
    .where(and(eq(publications.customDomain, domain), ne(publications.id, publication.id)));
  if (taken) return { ok: false, error: "Another publication already uses that domain." };
  await db
    .update(publications)
    .set({ customDomain: domain, customDomainVerifiedAt: null })
    .where(eq(publications.id, publication.id));
  refresh();
  return { ok: true, message: "Saved. Now add the DNS record below, then check it." };
}

export async function verifyCustomDomain(): Promise<DomainResult> {
  const { publication, allowed } = await editor();
  if (!allowed) return { ok: false, error: UPGRADE };
  const domain = publication.customDomain;
  if (!domain) return { ok: false, error: "Add a domain first." };
  if (!(await dnsPointsHere(domain))) {
    return {
      ok: false,
      error:
        "The DNS record isn't there yet. Changes can take up to an hour to appear; try again in a bit.",
    };
  }
  await db
    .update(publications)
    .set({ customDomainVerifiedAt: new Date() })
    .where(and(eq(publications.id, publication.id), eq(publications.customDomain, domain)));
  updateTag(publicationTag(publication.slug));
  refresh();
  return { ok: true, message: `Connected. Your publication is live at https://${domain}` };
}

export async function removeCustomDomain(): Promise<DomainResult> {
  const { publication } = await requirePublication("editor");
  await db
    .update(publications)
    .set({ customDomain: null, customDomainVerifiedAt: null })
    .where(eq(publications.id, publication.id));
  updateTag(publicationTag(publication.slug));
  refresh();
  return { ok: true, message: "Domain removed. Your page is at its Postmeadow address again." };
}

// ─── Sending address ─────────────────────────────────────────────────────────

export async function setSenderEmail(input: string): Promise<DomainResult> {
  const { publication, allowed } = await editor();
  if (!allowed) return { ok: false, error: UPGRADE };
  const email = emailSchema.safeParse(input);
  if (!email.success) return { ok: false, error: "Enter an address like hello@yourbrand.com" };
  const domain = normalizeDomain(email.data.split("@")[1] ?? "");
  if (!domain) return { ok: false, error: "That address's domain can't be used." };
  if (
    /^(gmail|googlemail|yahoo|outlook|hotmail|icloud|me|aol|proton|protonmail|gmx|web)\./.test(
      domain,
    )
  ) {
    return { ok: false, error: "Use an address on a domain you own (not Gmail, Outlook, etc.)." };
  }
  const provider = domainProvider();
  // Same domain as before: just a different address on it.
  const sameDomain =
    publication.senderEmail?.split("@")[1] === domain && publication.senderDomainId;
  try {
    if (sameDomain) {
      await db
        .update(publications)
        .set({ senderEmail: email.data })
        .where(eq(publications.id, publication.id));
    } else {
      if (publication.senderDomainId)
        await provider.remove(publication.senderDomainId).catch(() => {});
      const created = await provider.create(domain);
      await db
        .update(publications)
        .set({
          senderEmail: email.data,
          senderDomainId: created.id,
          senderDomainStatus: created.status,
          senderDomainRecords: created.records,
        })
        .where(eq(publications.id, publication.id));
    }
  } catch (error) {
    reportError("sender domain setup failed", error);
    return { ok: false, error: `Couldn't set up ${domain}: ${(error as Error).message}` };
  }
  refresh();
  return { ok: true, message: "Now add the DNS records below, then check them." };
}

export async function checkSenderDomain(): Promise<DomainResult> {
  const { publication, allowed } = await editor();
  if (!allowed) return { ok: false, error: UPGRADE };
  if (!publication.senderDomainId) return { ok: false, error: "Add a sending address first." };
  try {
    const result = await domainProvider().check(publication.senderDomainId);
    await db
      .update(publications)
      .set({ senderDomainStatus: result.status, senderDomainRecords: result.records })
      .where(eq(publications.id, publication.id));
    refresh();
    return result.status === "verified"
      ? { ok: true, message: `Verified. Emails now come from ${publication.senderEmail}.` }
      : {
          ok: false,
          error:
            result.status === "failed"
              ? "Verification failed. Check each record matches exactly, then try again."
              : "Not verified yet. DNS changes can take a while; check again later.",
        };
  } catch (error) {
    reportError("sender domain check failed", error);
    return { ok: false, error: "Couldn't check right now. Try again in a minute." };
  }
}

export async function removeSenderDomain(): Promise<DomainResult> {
  const { publication } = await requirePublication("editor");
  if (publication.senderDomainId) {
    await domainProvider()
      .remove(publication.senderDomainId)
      .catch(() => {});
  }
  await db
    .update(publications)
    .set({
      senderEmail: null,
      senderDomainId: null,
      senderDomainStatus: null,
      senderDomainRecords: null,
    })
    .where(eq(publications.id, publication.id));
  refresh();
  return { ok: true, message: "Back to sending from our address." };
}
