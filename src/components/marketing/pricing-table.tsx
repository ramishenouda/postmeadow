"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { IntervalToggle } from "@/components/interval-toggle";
import { buttonVariants } from "@/components/ui/button";
import {
  formatBytes,
  formatPrice,
  PAID_PLANS,
  PLANS,
  PRICES,
  STORAGE_ADDON_BYTES,
  type Interval,
  type PlanId,
} from "@/lib/plans";
import { cn } from "@/lib/utils";

/** What every plan includes. Plans differ in storage. */
export const INCLUDED = [
  "Unlimited posts and subscribers",
  "Rich-text editor with image uploads",
  "Branded emails and public archive",
  "Double opt-in and one-click unsubscribe",
  "Open and click stats",
  "RSS feed and social previews",
  "CSV import and export",
];

export function PricingTable() {
  const [interval, setInterval] = useState<Interval>("month");
  return (
    <div className="space-y-8">
      <div className="flex justify-center">
        <IntervalToggle value={interval} onChange={setInterval} />
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {(["free", ...PAID_PLANS] as PlanId[]).map((id) => {
          const featured = id === "pro";
          return (
            <div
              key={id}
              className={cn(
                "bg-background flex flex-col rounded-2xl border p-6",
                featured && "border-emerald-700 shadow-lg ring-1 ring-emerald-700",
              )}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{PLANS[id].name}</h3>
                {featured ? (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                    Most popular
                  </span>
                ) : null}
              </div>
              <p className="text-muted-foreground mt-1 text-sm">{PLANS[id].tagline}</p>
              <p className="mt-6">
                <span className="text-4xl font-semibold tracking-tight">
                  {id === "free" ? "$0" : formatPrice(PRICES[id][interval])}
                </span>
                <span className="text-muted-foreground text-sm">
                  {" "}
                  / {id === "free" ? "forever" : interval}
                </span>
              </p>
              {id !== "free" && interval === "year" ? (
                <p className="mt-1 text-xs text-emerald-700">
                  {formatPrice(PRICES[id].month * 12 - PRICES[id].year)} less than monthly
                </p>
              ) : null}
              <ul className="mt-6 flex-1 space-y-2 text-sm">
                <Feature strong>{formatBytes(PLANS[id].storageBytes)} image storage</Feature>
                {id !== "free" ? (
                  <Feature>
                    Add {formatBytes(STORAGE_ADDON_BYTES)} for{" "}
                    {formatPrice(PRICES.storage_addon[interval])}/{interval}
                  </Feature>
                ) : null}
                <Feature>{id === "free" ? "All features included" : "Everything in Free"}</Feature>
              </ul>
              <Link
                href={id === "free" ? "/sign-in" : "/dashboard/billing"}
                className={cn(
                  buttonVariants({ variant: featured ? "default" : "outline", size: "lg" }),
                  "mt-6 w-full",
                  featured && "bg-emerald-800 text-white hover:bg-emerald-900",
                )}
              >
                {id === "free" ? "Start free" : `Start with ${PLANS[id].name}`}
              </Link>
            </div>
          );
        })}
      </div>
      <div className="bg-muted/30 rounded-2xl border p-6">
        <h3 className="font-medium">Every plan includes</h3>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {INCLUDED.map((f) => (
            <Feature key={f}>{f}</Feature>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Feature({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden />
      <span className={cn(strong && "font-medium")}>{children}</span>
    </li>
  );
}
