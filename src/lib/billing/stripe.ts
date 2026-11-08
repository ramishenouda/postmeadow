import "server-only";
import Stripe from "stripe";
import { env } from "@/env";

let client: Stripe | null | undefined;

/** The Stripe client, or null when billing isn't configured. */
export function getStripe(): Stripe | null {
  if (client !== undefined) return client;
  if (!env.STRIPE_SECRET_KEY) return (client = null);
  const base = env.STRIPE_API_BASE ? new URL(env.STRIPE_API_BASE) : null;
  client = new Stripe(env.STRIPE_SECRET_KEY, {
    appInfo: { name: "Postmeadow" },
    ...(base && {
      host: base.hostname,
      port: Number(base.port),
      protocol: base.protocol === "https:" ? "https" : "http",
      maxNetworkRetries: 0,
    }),
  });
  return client;
}

/** Billing needs both the API key (to start checkouts) and the webhook secret (to learn the result). */
export const billingEnabled = () => Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
