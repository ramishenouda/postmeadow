import type { Metadata } from "next";
import { Suspense } from "react";
import { getBilling } from "@/lib/billing/service";
import { billingEnabled } from "@/lib/billing/stripe";
import { requirePublication } from "@/lib/dal";
import { storageUsage } from "@/lib/images/service";
import { accountUsage } from "@/lib/limits";
import { BillingPanel } from "./billing-panel";

export const metadata: Metadata = { title: "Billing" };

type Props = PageProps<"/dashboard/billing">;

export default function BillingPage({ searchParams }: Props) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-muted-foreground text-sm">Your plan, usage and payment details.</p>
      </div>
      <Suspense fallback={<div className="bg-muted h-96 animate-pulse rounded-xl" />}>
        <Billing searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Billing({ searchParams }: Pick<Props, "searchParams">) {
  const { user } = await requirePublication();
  const [billing, usage, sending, params] = await Promise.all([
    getBilling(user.id),
    storageUsage(user.id),
    accountUsage(user.id),
    searchParams,
  ]);
  return (
    <BillingPanel
      enabled={billingEnabled()}
      justCheckedOut={params.checkout === "success"}
      billing={{
        plan: billing?.plan ?? "free",
        interval: (billing?.billingInterval as "month" | "year" | null) ?? null,
        status: billing?.subscriptionStatus ?? null,
        currentPeriodEnd: billing?.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: billing?.cancelAtPeriodEnd ?? false,
        storageAddons: billing?.storageAddons ?? 0,
        hasCustomer: Boolean(billing?.stripeCustomerId),
        version: billing?.stripeEventAt?.toISOString() ?? null,
      }}
      usage={{ used: usage.used, limit: usage.limit }}
      sending={{ subscribers: sending.subscribers, emails: sending.emails }}
    />
  );
}
