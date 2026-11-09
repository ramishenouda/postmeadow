import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getBilling } from "@/lib/billing/service";
import { billingEnabled } from "@/lib/billing/stripe";
import { requirePublication } from "@/lib/dal";
import { formatMoney } from "@/lib/format-money";
import { CURRENCIES, feePercent, paidStats } from "@/lib/paid";
import { absoluteUrl } from "@/lib/urls";
import { ConnectButtons, OpenToggle, PriceForm } from "./earn-forms";

export const metadata: Metadata = { title: "Earn" };

type Props = PageProps<"/dashboard/monetize">;

export default function EarnPage({ searchParams }: Props) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Earn</h1>
        <p className="text-muted-foreground text-sm">
          Let readers pay for your newsletter. Mark posts as paid: paying readers get all of them,
          everyone else gets the beginning and an invitation to upgrade.
        </p>
      </div>
      <Suspense fallback={<div className="bg-muted h-96 animate-pulse rounded-xl" />}>
        <Earn searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Earn({ searchParams }: Pick<Props, "searchParams">) {
  const { publication } = await requirePublication("owner");
  const { connected } = await searchParams;
  const [billing, stats] = await Promise.all([
    getBilling(publication.ownerId),
    paidStats(publication.id),
  ]);
  const fee = feePercent(billing?.plan);
  const currency = publication.paidCurrency;
  const monthlyRevenue =
    stats.monthly * (publication.paidMonthlyCents ?? 0) +
    Math.round((stats.yearly * (publication.paidYearlyCents ?? 0)) / 12);

  if (!billingEnabled()) {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
        Payments aren&apos;t set up on this server yet (Stripe keys are missing).
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Paid subscribers</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {stats.paying.toLocaleString("en")}
            </CardTitle>
            <p className="text-muted-foreground text-xs">
              {`${stats.monthly} monthly · ${stats.yearly} yearly`}
            </p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Monthly revenue (about)</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {formatMoney(monthlyRevenue, currency)}
            </CardTitle>
            <p className="text-muted-foreground text-xs">Before fees, at current prices</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Our fee</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{fee}%</CardTitle>
            <p className="text-muted-foreground text-xs">
              On your plan, plus Stripe&apos;s processing fee. Lower on Pro and Business.
            </p>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Connect Stripe</CardTitle>
          <CardDescription>
            Payments go to your own Stripe account and are paid out to your bank by Stripe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectButtons
            account={Boolean(publication.stripeAccountId)}
            ready={publication.stripeChargesEnabled}
            justReturned={connected === "1"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Prices</CardTitle>
          <CardDescription>
            A monthly price, a yearly price, or both. Changing a price applies to new subscribers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PriceForm
            currencies={[...CURRENCIES]}
            currency={currency}
            monthly={publication.paidMonthlyCents}
            yearly={publication.paidYearlyCents}
            description={publication.paidDescription ?? ""}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Open paid subscriptions</CardTitle>
          <CardDescription>
            {`Readers upgrade at ${absoluteUrl(`/${publication.slug}/upgrade`)}. The link also appears on your page and under paid posts.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OpenToggle enabled={publication.paidEnabled} />
        </CardContent>
      </Card>
    </div>
  );
}
