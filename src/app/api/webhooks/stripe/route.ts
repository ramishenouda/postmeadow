import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { env } from "@/env";
import { getStripe } from "@/lib/billing/stripe";
import { applySubscription, linkCustomer } from "@/lib/billing/sync";

/**
 * Stripe webhook: the only place a plan changes. In Stripe → Developers → Webhooks,
 * send checkout.session.completed and customer.subscription.* to this URL and put
 * the signing secret in STRIPE_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
    return Response.json({ error: "Billing not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      await request.text(),
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Stripe retries; process each event once.
  const fresh = await db
    .insert(webhookEvents)
    .values({ id: event.id, type: event.type })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (fresh.length === 0) return Response.json({ ok: true, duplicate: true });

  try {
    const created = new Date(event.created * 1000);
    let result: string = "ignored";
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const customer =
          typeof session.customer === "string" ? session.customer : session.customer?.id;
        if (session.client_reference_id && customer) {
          await linkCustomer(session.client_reference_id, customer);
          result = "linked";
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        result = await applySubscription(event.data.object, created);
        break;
    }
    return Response.json({ ok: true, result });
  } catch (error) {
    // Forget the event so Stripe's retry is processed.
    await db.delete(webhookEvents).where(eq(webhookEvents.id, event.id));
    console.error("Stripe webhook failed", { id: event.id, type: event.type, error });
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
