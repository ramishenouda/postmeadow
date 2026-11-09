import type { Metadata } from "next";
import { Suspense } from "react";
import { env } from "@/env";
import { requirePublication } from "@/lib/dal";
import { listImages, storageUsage } from "@/lib/images/service";
import { DeleteAccount } from "./delete-account";
import { DomainsSection } from "./domains-section";
import { getBilling } from "@/lib/billing/service";
import { domainTarget } from "@/lib/domains";
import { allowsCustomDomains } from "@/lib/plans";
import { EmbedSnippets } from "./embed-snippets";
import { SettingsForm } from "./settings-form";
import { StorageSection } from "./storage-section";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">
          How your publication appears on the web and in inboxes.
        </p>
      </div>
      <Suspense fallback={<div className="bg-muted h-96 animate-pulse rounded-xl" />}>
        <Settings />
      </Suspense>
      <Suspense fallback={<div className="bg-muted h-48 animate-pulse rounded-xl" />}>
        <Storage />
      </Suspense>
      <Suspense fallback={<div className="bg-muted h-48 animate-pulse rounded-xl" />}>
        <Embed />
      </Suspense>
      <Suspense fallback={null}>
        <Domains />
      </Suspense>
      <Suspense fallback={null}>
        <Danger />
      </Suspense>
    </div>
  );
}

async function Domains() {
  const { publication } = await requirePublication("editor");
  const billing = await getBilling(publication.ownerId);
  return (
    <DomainsSection
      allowed={allowsCustomDomains(billing?.plan ?? "free")}
      target={domainTarget()}
      customDomain={publication.customDomain}
      verified={Boolean(publication.customDomainVerifiedAt)}
      senderEmail={publication.senderEmail}
      senderStatus={publication.senderDomainStatus}
      senderRecords={publication.senderDomainRecords ?? []}
      defaultFrom={(env.EMAIL_FROM.match(/<([^>]+)>/)?.[1] ?? env.EMAIL_FROM).trim()}
    />
  );
}

async function Danger() {
  const { publication, role } = await requirePublication("editor");
  // Only the owner can delete the publication (with their account).
  if (role !== "owner") return null;
  return <DeleteAccount slug={publication.slug} />;
}

async function Embed() {
  const { publication } = await requirePublication("editor");
  return <EmbedSnippets origin={new URL(env.APP_URL).origin} slug={publication.slug} />;
}

async function Settings() {
  const { publication } = await requirePublication("editor");
  return (
    <SettingsForm
      address={`${new URL(env.APP_URL).host}/${publication.slug}`}
      values={{
        name: publication.name,
        description: publication.description ?? "",
        fromName: publication.fromName,
        replyTo: publication.replyTo ?? "",
        postalAddress: publication.postalAddress ?? "",
        logoUrl: publication.logoUrl ?? "",
        accentColor: publication.accentColor ?? "",
        fontStyle: publication.fontStyle,
        welcomeEnabled: publication.welcomeEnabled ? "on" : "",
        commentsEnabled: publication.commentsEnabled ? "on" : "",
        welcomeMessage: publication.welcomeMessage ?? "",
        emailDesign: publication.emailDesign,
      }}
    />
  );
}

async function Storage() {
  // Images count toward the publication owner's storage, whoever uploaded them.
  const { publication } = await requirePublication("editor");
  const [usage, uploaded] = await Promise.all([
    storageUsage(publication.ownerId),
    listImages(publication.ownerId),
  ]);
  return <StorageSection usage={usage} images={uploaded} />;
}
