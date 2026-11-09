/**
 * Plans, limits and prices: the single source of truth. Upload checks, usage bars,
 * the pricing page and checkout read from here, and `npm run stripe:setup` creates
 * matching products and prices in Stripe (found again by their lookup keys).
 */

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const PLANS = {
  free: {
    name: "Free",
    storageBytes: 500 * MB,
    subscribers: 1_000,
    emailsPerMonth: 10_000,
    invitesPerDay: 100,
    teammates: 1,
    customDomains: false,
    tagline: "Everything you need to start.",
  },
  pro: {
    name: "Pro",
    storageBytes: 10 * GB,
    subscribers: 10_000,
    emailsPerMonth: 100_000,
    invitesPerDay: 1_000,
    teammates: 5,
    customDomains: true,
    tagline: "For writers with a growing list.",
  },
  business: {
    name: "Business",
    storageBytes: 50 * GB,
    subscribers: 50_000,
    emailsPerMonth: 500_000,
    invitesPerDay: 5_000,
    teammates: 25,
    customDomains: true,
    tagline: "For teams and image-heavy newsletters.",
  },
} as const;

const planOf = (plan: string) => (isPlanId(plan) ? PLANS[plan] : PLANS.free);

/** Own web address and sending domain: paid plans. */
export const allowsCustomDomains = (plan: string) => planOf(plan).customDomains;

/** People besides the owner who can work on the publication. */
export const teammateLimit = (plan: string) => planOf(plan).teammates;

/** Invitation emails a publication may send per 24 hours (they go to people who haven't opted in). */
export const invitesPerDay = (plan: string) => planOf(plan).invitesPerDay;

/**
 * Sending limits. Active subscribers: sign-ups keep working past the limit, but
 * sending pauses until the list is back under it or the plan is upgraded. Emails per
 * calendar month (UTC): a safety net against very frequent sending.
 */
export const subscriberLimit = (plan: string) => planOf(plan).subscribers;
export const monthlyEmailLimit = (plan: string) => planOf(plan).emailsPerMonth;

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
