/** Our cut of readers' paid subscriptions, by the writer's plan (plus Stripe's fees). */
export const FEE_PERCENT = { free: 10, pro: 5, business: 3 } as const;
