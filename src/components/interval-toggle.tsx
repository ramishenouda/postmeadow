"use client";

import type { Interval } from "@/lib/plans";
import { cn } from "@/lib/utils";

/** Monthly / Yearly switch used on the pricing and billing pages. */
export function IntervalToggle({
  value,
  onChange,
}: {
  value: Interval;
  onChange: (interval: Interval) => void;
}) {
  return (
    <div
      className="bg-muted inline-flex gap-1 rounded-lg p-1 text-sm"
      role="radiogroup"
      aria-label="Billing period"
    >
      {(
        [
          ["month", "Monthly"],
          ["year", "Yearly"],
        ] as const
      ).map(([interval, label]) => (
        <button
          key={interval}
          type="button"
          role="radio"
          aria-checked={value === interval}
          onClick={() => onChange(interval)}
          className={cn(
            "rounded-md px-3 py-1.5",
            value === interval ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
          )}
        >
          {label}
          {interval === "year" ? (
            <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800">
              2 months free
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
