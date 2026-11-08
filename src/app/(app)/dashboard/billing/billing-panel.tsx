"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IntervalToggle } from "@/components/interval-toggle";
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
import {
  checkout,
  manageBilling,
  switchPlan,
  updateStorageAddons,
  type BillingResult,
} from "./actions";

type Billing = {
  plan: string;
  interval: Interval | null;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  storageAddons: number;
  hasCustomer: boolean;
  /** Changes whenever a Stripe webhook is applied. */
  version: string | null;
};

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

export function BillingPanel({
  enabled,
  justCheckedOut,
  billing,
  usage,
}: {
  enabled: boolean;
  justCheckedOut: boolean;
  billing: Billing;
  usage: { used: number; limit: number };
}) {
  const router = useRouter();
  const [interval, setInterval] = useState<Interval>(billing.interval ?? "month");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  // After a change we wait for Stripe's webhook; this remembers which version we're waiting past.
  const [waitingPast, setWaitingPast] = useState<string | null | undefined>(
    justCheckedOut && billing.plan === "free" ? billing.version : undefined,
  );
  const waiting = waitingPast !== undefined && waitingPast === billing.version;

  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => router.refresh(), 1500);
    const stop = window.setTimeout(() => setWaitingPast(undefined), 30_000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [waiting, router]);

  const act = (fn: () => Promise<BillingResult>, waitForWebhook = false) =>
    startTransition(async () => {
      setError(null);
      const result = await fn();
      if (!result.ok) return setError(result.error);
      if (result.url) return window.location.assign(result.url);
      if (waitForWebhook) setWaitingPast(billing.version);
    });

  const plan = (billing.plan in PLANS ? billing.plan : "free") as PlanId;
  const paid = plan !== "free";
  const periodEnd = billing.currentPeriodEnd
    ? dateFormat.format(new Date(billing.currentPeriodEnd))
    : null;
  const overQuota = usage.used > usage.limit;

  return (
    <div className="space-y-6">
      {!enabled ? (
        <Notice tone="muted">
          Billing isn&apos;t switched on for this server yet (Stripe keys missing). Everyone is on
          the Free plan.
        </Notice>
      ) : null}
      {waiting ? (
        <Notice tone="info">
          {justCheckedOut ? "Thanks! " : ""}Waiting for Stripe to confirm your change…
        </Notice>
      ) : null}
      {billing.status === "past_due" ? (
        <Notice tone="danger">
          Your last payment didn&apos;t go through. Update your card to keep {PLANS[plan].name}.
          Stripe will retry automatically.{" "}
          <InlineButton onClick={() => act(manageBilling)} disabled={busy}>
            Update payment method
          </InlineButton>
        </Notice>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>{PLANS[plan].name} plan</CardTitle>
          <CardDescription>
            {paid
              ? `${formatPrice(PRICES[plan][billing.interval ?? "month"])} per ${billing.interval ?? "month"}` +
                (billing.storageAddons
                  ? ` + ${billing.storageAddons} storage add-on${billing.storageAddons === 1 ? "" : "s"}`
                  : "") +
                (periodEnd
                  ? billing.cancelAtPeriodEnd
                    ? `. Ends on ${periodEnd}; you'll move to Free after that.`
                    : `. Renews on ${periodEnd}.`
                  : ".")
              : "Free forever. Upgrade any time for more storage."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <StorageBar used={usage.used} limit={usage.limit} />
          {overQuota ? (
            <p className="text-destructive text-sm">
              You&apos;re using more than your plan includes. Existing images keep working, but new
              uploads are paused until you free up space or add storage.
            </p>
          ) : null}
          {billing.hasCustomer && enabled ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => act(manageBilling)}>
              Manage billing (cards, invoices, cancel)
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium">Plans</h2>
          <IntervalToggle value={interval} onChange={setInterval} />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {(["free", ...PAID_PLANS] as PlanId[]).map((id) => {
            const isCurrent = id === plan && (id === "free" || billing.interval === interval);
            return (
              <Card key={id} className={cn(isCurrent && "ring-foreground ring-2")}>
                <CardHeader>
                  <CardTitle>{PLANS[id].name}</CardTitle>
                  <CardDescription>{PLANS[id].tagline}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>
                    <span className="text-3xl font-semibold">
                      {id === "free" ? "$0" : formatPrice(PRICES[id][interval])}
                    </span>{" "}
                    <span className="text-muted-foreground text-sm">
                      / {id === "free" ? "forever" : interval}
                    </span>
                  </p>
                  <p className="text-sm">{formatBytes(PLANS[id].storageBytes)} image storage</p>
                  <PlanButton
                    id={id}
                    current={plan}
                    isCurrent={isCurrent}
                    interval={interval}
                    disabled={!enabled || busy || waiting}
                    onCheckout={() => act(() => checkout(id, interval))}
                    onSwitch={() => act(() => switchPlan(id, interval), true)}
                    onDowngrade={() => act(manageBilling)}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {paid ? (
        <Addons
          key={billing.storageAddons}
          current={billing.storageAddons}
          interval={billing.interval ?? "month"}
          disabled={!enabled || busy || waiting || billing.cancelAtPeriodEnd}
          onSave={(q) => act(() => updateStorageAddons(q), true)}
        />
      ) : null}
    </div>
  );
}

function PlanButton({
  id,
  current,
  isCurrent,
  interval,
  disabled,
  onCheckout,
  onSwitch,
  onDowngrade,
}: {
  id: PlanId;
  current: PlanId;
  isCurrent: boolean;
  interval: Interval;
  disabled: boolean;
  onCheckout: () => void;
  onSwitch: () => void;
  onDowngrade: () => void;
}) {
  if (isCurrent) {
    return (
      <Button className="w-full" variant="outline" disabled>
        Current plan
      </Button>
    );
  }
  if (id === "free") {
    // Cancelling happens in Stripe's portal, at the end of the paid period.
    return (
      <Button className="w-full" variant="outline" disabled={disabled} onClick={onDowngrade}>
        Downgrade
      </Button>
    );
  }
  if (current === "free") {
    return (
      <Button className="w-full" disabled={disabled} onClick={onCheckout}>
        Upgrade to {PLANS[id].name}
      </Button>
    );
  }
  const label =
    id === current
      ? `Switch to ${interval === "year" ? "yearly" : "monthly"}`
      : `Switch to ${PLANS[id].name}`;
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button className="w-full" disabled={disabled} />}>
        {label}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label}?</AlertDialogTitle>
          <AlertDialogDescription>
            {PLANS[id].name} costs {formatPrice(PRICES[id as Exclude<PlanId, "free">][interval])}{" "}
            per {interval}. Stripe adjusts your next invoice for the time left on your current plan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onSwitch}>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Addons({
  current,
  interval,
  disabled,
  onSave,
}: {
  current: number;
  interval: Interval;
  disabled: boolean;
  onSave: (quantity: number) => void;
}) {
  const [quantity, setQuantity] = useState(current);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Extra storage</CardTitle>
        <CardDescription>
          {formatBytes(STORAGE_ADDON_BYTES)} for {formatPrice(PRICES.storage_addon[interval])} per{" "}
          {interval}, as many as you need.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-lg border">
          <button
            type="button"
            aria-label="Fewer add-ons"
            className="px-3 py-1.5 disabled:opacity-40"
            disabled={disabled || quantity <= 0}
            onClick={() => setQuantity((q) => q - 1)}
          >
            −
          </button>
          <span className="min-w-10 text-center tabular-nums" aria-live="polite">
            {quantity}
          </span>
          <button
            type="button"
            aria-label="More add-ons"
            className="px-3 py-1.5 disabled:opacity-40"
            disabled={disabled || quantity >= 50}
            onClick={() => setQuantity((q) => q + 1)}
          >
            +
          </button>
        </div>
        <span className="text-muted-foreground text-sm">
          +{formatBytes(quantity * STORAGE_ADDON_BYTES)} ·{" "}
          {formatPrice(quantity * PRICES.storage_addon[interval])} / {interval}
        </span>
        <Button
          size="sm"
          disabled={disabled || quantity === current}
          onClick={() => onSave(quantity)}
        >
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

function StorageBar({ used, limit }: { used: number; limit: number }) {
  const percent = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>Storage</span>
        <span className="text-muted-foreground">
          {formatBytes(used)} of {formatBytes(limit)}
        </span>
      </div>
      <div
        className="bg-muted h-2 overflow-hidden rounded-full"
        role="progressbar"
        aria-label="Storage used"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            "h-full",
            percent >= 90 ? "bg-destructive" : percent >= 75 ? "bg-amber-500" : "bg-foreground",
          )}
          style={{ width: `${Math.max(percent, used > 0 ? 1 : 0)}%` }}
        />
      </div>
    </div>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "info" | "danger" | "muted";
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        tone === "danger" && "border-destructive/30 bg-destructive/5 text-destructive",
        tone === "info" && "border-sky-600/20 bg-sky-50 text-sky-900",
        tone === "muted" && "bg-muted/50 text-muted-foreground",
      )}
    >
      {children}
    </div>
  );
}

function InlineButton(props: React.ComponentProps<"button">) {
  return <button type="button" className="font-medium underline underline-offset-2" {...props} />;
}
