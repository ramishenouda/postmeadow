"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  connectStripe,
  openPayouts,
  refreshStripe,
  savePaidSettings,
  setPaidEnabled,
  type EarnResult,
} from "./actions";

function useResult() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<EarnResult | null>(null);
  const run = (action: () => Promise<EarnResult>) =>
    startTransition(async () => {
      const r = await action();
      if (r) setResult(r);
    });
  const message = result ? (
    <p
      role={result.ok ? "status" : "alert"}
      className={result.ok ? "text-sm text-emerald-700" : "text-destructive text-sm"}
    >
      {result.ok ? result.message : result.error}
    </p>
  ) : null;
  return { pending, run, message };
}

export function ConnectButtons({
  account,
  ready,
  justReturned,
}: {
  account: boolean;
  ready: boolean;
  justReturned: boolean;
}) {
  const { pending, run, message } = useResult();
  return (
    <div className="space-y-2">
      <p className="text-sm">
        {ready
          ? "Connected. Your account can take payments."
          : account
            ? "Started. Stripe needs a few more details before you can take payments."
            : "Not connected yet."}
      </p>
      <div className="flex flex-wrap gap-2">
        {ready ? null : (
          <Button disabled={pending} onClick={() => run(connectStripe)}>
            {account ? "Continue Stripe setup" : "Connect Stripe"}
          </Button>
        )}
        {account ? (
          <Button variant="outline" disabled={pending} onClick={() => run(refreshStripe)}>
            {justReturned && !ready ? "I've finished, check again" : "Refresh status"}
          </Button>
        ) : null}
        {ready ? (
          <Button variant="outline" disabled={pending} onClick={() => run(openPayouts)}>
            Payouts and balance
          </Button>
        ) : null}
      </div>
      {message}
    </div>
  );
}

const asAmount = (cents: number | null) => (cents == null ? "" : (cents / 100).toString());

export function PriceForm({
  currencies,
  currency,
  monthly,
  yearly,
  description,
}: {
  currencies: string[];
  currency: string;
  monthly: number | null;
  yearly: number | null;
  description: string;
}) {
  const { pending, run, message } = useResult();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run(() =>
          savePaidSettings({
            currency: String(f.get("currency") ?? "usd"),
            monthly: String(f.get("monthly") ?? ""),
            yearly: String(f.get("yearly") ?? ""),
            description: String(f.get("description") ?? ""),
          }),
        );
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pr-currency">Currency</Label>
          <select
            id="pr-currency"
            name="currency"
            defaultValue={currency}
            className="bg-background h-8 rounded-lg border px-2.5 text-sm"
          >
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-monthly">Monthly</Label>
          <Input
            id="pr-monthly"
            name="monthly"
            inputMode="decimal"
            defaultValue={asAmount(monthly)}
            placeholder="8"
            className="w-28"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-yearly">Yearly</Label>
          <Input
            id="pr-yearly"
            name="yearly"
            inputMode="decimal"
            defaultValue={asAmount(yearly)}
            placeholder="80"
            className="w-28"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pr-desc">What paid subscribers get</Label>
        <textarea
          id="pr-desc"
          name="description"
          defaultValue={description}
          rows={4}
          maxLength={1000}
          placeholder={
            "- Every post, including the deep dives\n- The full archive\n- My thanks, honestly"
          }
          className="bg-background focus-visible:ring-ring/50 w-full rounded-lg border px-2.5 py-2 text-sm outline-none focus-visible:ring-3"
        />
        <p className="text-muted-foreground text-xs">Shown on your upgrade page. Markdown works.</p>
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        Save prices
      </Button>
      {message}
    </form>
  );
}

export function OpenToggle({ enabled }: { enabled: boolean }) {
  const { pending, run, message } = useResult();
  return (
    <div className="space-y-2">
      <Button
        variant={enabled ? "outline" : "default"}
        disabled={pending}
        onClick={() => run(() => setPaidEnabled(!enabled))}
      >
        {enabled ? "Close paid subscriptions" : "Open paid subscriptions"}
      </Button>
      {message}
    </div>
  );
}
