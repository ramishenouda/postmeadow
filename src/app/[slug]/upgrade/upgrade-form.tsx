"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import { startUpgrade, type UpgradeState } from "./actions";

export function UpgradeForm({
  slug,
  currency,
  monthly,
  yearly,
}: {
  slug: string;
  currency: string;
  monthly: number | null;
  yearly: number | null;
}) {
  const [state, action, pending] = useActionState<UpgradeState, FormData>(
    startUpgrade.bind(null, slug),
    { status: "idle" },
  );
  const [interval, setInterval] = useState<"month" | "year">(yearly && !monthly ? "year" : "month");
  const options = [
    monthly
      ? {
          id: "month" as const,
          label: "Monthly",
          price: `${formatMoney(monthly, currency)} / month`,
          note: "",
        }
      : null,
    yearly
      ? {
          id: "year" as const,
          label: "Yearly",
          price: `${formatMoney(yearly, currency)} / year`,
          note:
            monthly && yearly < monthly * 12
              ? `Save ${Math.round((1 - yearly / (monthly * 12)) * 100)}%`
              : "",
        }
      : null,
  ].filter((o) => o !== null);

  return (
    <form action={action} className="mx-auto max-w-md space-y-4">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Billing</legend>
        {options.map((o) => (
          <label
            key={o.id}
            className={cn(
              "cursor-pointer rounded-xl border p-4",
              interval === o.id ? "border-(--accent) bg-(--accent)/5" : "hover:bg-muted/40",
            )}
          >
            <input
              type="radio"
              name="interval"
              value={o.id}
              checked={interval === o.id}
              onChange={() => setInterval(o.id)}
              className="sr-only"
            />
            <span className="block text-sm font-medium">{o.label}</span>
            <span className="block text-lg font-semibold">{o.price}</span>
            {o.note ? <span className="text-xs font-medium text-(--accent)">{o.note}</span> : null}
          </label>
        ))}
      </fieldset>
      <Input
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        aria-label="Your email"
      />
      <Button
        type="submit"
        disabled={pending}
        className="w-full bg-(--accent) text-white hover:bg-(--accent)/90"
      >
        {pending ? "Opening checkout…" : "Continue to payment"}
      </Button>
      {state.status === "error" ? (
        <p role="alert" className="text-destructive text-sm">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
