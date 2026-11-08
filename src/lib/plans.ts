/**
 * Plans, limits and prices: the single source of truth. Upload checks, usage bars,
 * the pricing page and checkout read from here, and `npm run stripe:setup` creates
 * matching products and prices in Stripe (found again by their lookup keys).
 */

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const PLANS = {
  free: { name: "Free", storageBytes: 500 * MB, tagline: "Everything you need to start." },
  pro: { name: "Pro", storageBytes: 10 * GB, tagline: "For writers with a growing list." },
  business: {
    name: "Business",
    storageBytes: 50 * GB,
    tagline: "For teams and image-heavy newsletters.",
  },
} as const;

export type PlanId = keyof typeof PLANS;
export type PaidPlanId = Exclude<PlanId, "free">;
export const PAID_PLANS: PaidPlanId[] = ["pro", "business"];
export type Interval = "month" | "year";

/** Extra storage a paid plan can buy, any number of times. */
export const STORAGE_ADDON_BYTES = 10 * GB;

/** Prices in US cents. Yearly is 10× monthly: two months free. */
export const PRICES: Record<PaidPlanId | "storage_addon", Record<Interval, number>> = {
  pro: { month: 900, year: 9000 },
  business: { month: 2900, year: 29000 },
  storage_addon: { month: 300, year: 3000 },
};

export type PriceItem = PaidPlanId | "storage_addon";

/** Stripe price lookup key, e.g. "postmeadow_pro_month". */
export const lookupKey = (item: PriceItem, interval: Interval) => `postmeadow_${item}_${interval}`;

export function parseLookupKey(
  key: string | null | undefined,
): { item: PriceItem; interval: Interval } | null {
  const match = key?.match(/^postmeadow_(pro|business|storage_addon)_(month|year)$/);
  return match ? { item: match[1] as PriceItem, interval: match[2] as Interval } : null;
}

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

/** "$9", "$2.50" */
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}
