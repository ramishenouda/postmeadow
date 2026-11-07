import type { Metadata } from "next";
import { Suspense } from "react";
import { env } from "@/env";
import { requirePublication } from "@/lib/dal";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings · Newsletter" };

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
      }}
    />
  );
}
