import type { Metadata } from "next";
import { Suspense } from "react";
import { env } from "@/env";
import { requirePublication } from "@/lib/dal";
import { listImages, storageUsage } from "@/lib/images/service";
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
    </div>
  );
}

async function Settings() {
  const { publication } = await requirePublication();
  return (
    <SettingsForm
      address={`${new URL(env.APP_URL).host}/${publication.slug}`}
      values={{
        name: publication.name,
        description: publication.description ?? "",
        fromName: publication.fromName,
        replyTo: publication.replyTo ?? "",
        logoUrl: publication.logoUrl ?? "",
        accentColor: publication.accentColor ?? "",
        fontStyle: publication.fontStyle,
        welcomeEnabled: publication.welcomeEnabled ? "on" : "",
        welcomeMessage: publication.welcomeMessage ?? "",
      }}
    />
  );
}

async function Storage() {
  const { user } = await requirePublication();
  const [usage, uploaded] = await Promise.all([storageUsage(user.id), listImages(user.id)]);
  return <StorageSection usage={usage} images={uploaded} />;
}
