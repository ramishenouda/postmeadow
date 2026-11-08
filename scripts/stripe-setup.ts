/**
 * Creates (or updates) Postmeadow's products and prices in Stripe from src/lib/plans.ts.
 *
 *   npm run stripe:setup
 *
 * Safe to run repeatedly. Prices are found by lookup key; when an amount in
 * plans.ts changes, a new price takes over the lookup key and the old one is
 * archived. Existing subscribers keep paying what they signed up for until you move them.
 */
import { loadEnvConfig } from "@next/env";
import Stripe from "stripe";
import { lookupKey, PLANS, PRICES, type Interval, type PriceItem } from "../src/lib/plans";

loadEnvConfig(process.cwd());
const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY is not set. Add your test-mode key to .env.local first.");
  process.exit(1);
}
if (key.startsWith("sk_live_") && !process.argv.includes("--live")) {
  console.error("That's a live key. Re-run with --live if you really mean to change live prices.");
  process.exit(1);
}
const stripe = new Stripe(key);

const PRODUCTS: Record<PriceItem, { name: string; description: string }> = {
  pro: { name: `Postmeadow ${PLANS.pro.name}`, description: PLANS.pro.tagline },
  business: { name: `Postmeadow ${PLANS.business.name}`, description: PLANS.business.tagline },
  storage_addon: {
    name: "Postmeadow storage add-on",
    description: "10 GB of extra image storage",
  },
};

async function product(item: PriceItem): Promise<string> {
  // Find our product by metadata (ours are tagged), or create it.
  for await (const p of stripe.products.list({ active: true, limit: 100 })) {
    if (p.metadata.postmeadow_item === item) return p.id;
  }
  const created = await stripe.products.create({
    ...PRODUCTS[item],
    metadata: { postmeadow_item: item },
  });
  console.log(`  created product ${created.name}`);
  return created.id;
}

async function main() {
  for (const item of Object.keys(PRICES) as PriceItem[]) {
    const productId = await product(item);
    for (const interval of ["month", "year"] as Interval[]) {
      const key = lookupKey(item, interval);
      const amount = PRICES[item][interval];
      const { data } = await stripe.prices.list({ lookup_keys: [key], limit: 1 });
      const current = data[0];
      if (current?.active && current.unit_amount === amount && current.product === productId) {
        console.log(`✓ ${key}: $${amount / 100}/${interval} (unchanged)`);
        continue;
      }
      await stripe.prices.create({
        product: productId,
        currency: "usd",
        unit_amount: amount,
        recurring: { interval },
        lookup_key: key,
        transfer_lookup_key: true, // take the key over from the old price, if any
        metadata: { postmeadow_item: item },
      });
      if (current?.active) await stripe.prices.update(current.id, { active: false });
      console.log(
        `+ ${key}: $${amount / 100}/${interval}${current ? " (replaced old price)" : ""}`,
      );
    }
  }
  console.log(
    "\nDone. Also enable the customer portal (cancellations, card updates, invoices) in\n" +
      "Stripe → Settings → Billing → Customer portal.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
