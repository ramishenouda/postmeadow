import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { env } from "@/env";
import { getPublicationForUser, requireUser } from "@/lib/dal";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Create your publication · Newsletter" };

export default function OnboardingPage() {
  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Create your publication</h1>
        <p className="text-muted-foreground">
          This is what your readers subscribe to. You can change everything except the address
          later.
        </p>
      </div>
      <Suspense fallback={<div className="bg-muted h-96 animate-pulse rounded-xl" />}>
        <Onboarding />
      </Suspense>
    </div>
  );
}

async function Onboarding() {
  const user = await requireUser();
  if (await getPublicationForUser(user.id)) redirect("/dashboard");
  return <OnboardingForm defaultFromName={user.name} publicHost={new URL(env.APP_URL).host} />;
}
