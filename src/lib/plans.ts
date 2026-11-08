/**
 * Plans and their limits. Prices live in Stripe (added with billing); limits live here.
 * Change a number here and it applies everywhere: upload checks, usage bars, settings.
 */

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const PLANS = {
  free: { name: "Free", storageBytes: 500 * MB },
  pro: { name: "Pro", storageBytes: 10 * GB },
  business: { name: "Business", storageBytes: 50 * GB },
} as const;

export type PlanId = keyof typeof PLANS;

/** Extra storage a paid plan can buy, any number of times. */
export const STORAGE_ADDON_BYTES = 10 * GB;

export function isPlanId(value: string): value is PlanId {
  return value in PLANS;
}

export function storageLimit(plan: string, addons: number): number {
  const base = isPlanId(plan) ? PLANS[plan].storageBytes : PLANS.free.storageBytes;
  // Add-ons only apply to paid plans.
  return base + (plan !== "free" ? Math.max(0, addons) * STORAGE_ADDON_BYTES : 0);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < GB) return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`;
  return `${(bytes / GB).toFixed(bytes < 10 * GB ? 1 : 0)} GB`;
}
