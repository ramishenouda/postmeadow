"use server";

import { requirePublication } from "@/lib/dal";
import {
  BillingError,
  changePlan,
  portalUrl,
  setStorageAddons,
  startCheckout,
} from "@/lib/billing/service";
import { PAID_PLANS, type Interval, type PaidPlanId } from "@/lib/plans";

export type BillingResult = { ok: true; url?: string } | { ok: false; error: string };

const isPaidPlan = (v: unknown): v is PaidPlanId => PAID_PLANS.includes(v as PaidPlanId);
const isInterval = (v: unknown): v is Interval => v === "month" || v === "year";

async function run(fn: () => Promise<string | void>): Promise<BillingResult> {
  try {
    const url = await fn();
    return url ? { ok: true, url } : { ok: true };
  } catch (error) {
    if (error instanceof BillingError) return { ok: false, error: error.message };
    console.error("billing action failed", error);
    return { ok: false, error: "Something went wrong talking to Stripe. Try again." };
  }
}

export async function checkout(plan: unknown, interval: unknown): Promise<BillingResult> {
  const { user } = await requirePublication();
  if (!isPaidPlan(plan) || !isInterval(interval)) return { ok: false, error: "Unknown plan." };
  return run(() => startCheckout(user, plan, interval));
}

export async function switchPlan(plan: unknown, interval: unknown): Promise<BillingResult> {
  const { user } = await requirePublication();
  if (!isPaidPlan(plan) || !isInterval(interval)) return { ok: false, error: "Unknown plan." };
  return run(() => changePlan(user.id, plan, interval));
}

export async function updateStorageAddons(quantity: unknown): Promise<BillingResult> {
  const { user } = await requirePublication();
  return run(() => setStorageAddons(user.id, Number(quantity)));
}

export async function manageBilling(): Promise<BillingResult> {
  const { user } = await requirePublication();
  return run(() => portalUrl(user.id));
}
