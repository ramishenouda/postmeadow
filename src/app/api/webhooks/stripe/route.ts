import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { env } from "@/env";
import { getStripe } from "@/lib/billing/stripe";
import { applySubscription, linkCustomer } from "@/lib/billing/sync";
import { reportError } from "@/lib/report";
import { applyReaderSubscription, setChargesEnabled } from "@/lib/paid";

/**
 * Stripe webhook: the only place a plan changes. In Stripe → Developers → Webhooks,
 * send checkout.session.completed and customer.subscription.* to this URL and put
 * the signing secret in STRIPE_WEBHOOK_SECRET. Readers' paid subscriptions arrive
 * here too (metadata.kind = "reader"); for writers' Stripe accounts, also send
 * account.updated from connected accounts.
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
        // A reader's paid subscription: the subscription events do the work.
        if (session.metadata?.kind === "reader") {
          result = "reader-checkout";
          break;
        }
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
        result =
          event.data.object.metadata?.kind === "reader"
            ? await applyReaderSubscription(event.data.object)
            : await applySubscription(event.data.object, created);
        break;
      // A writer's connected account (needs "Listen to events on Connected accounts").
      case "account.updated":
        await setChargesEnabled(event.data.object.id, Boolean(event.data.object.charges_enabled));
        result = "account";
        break;
    }
    return Response.json({ ok: true, result });
  } catch (error) {
    // Forget the event so Stripe's retry is processed.
    await db.delete(webhookEvents).where(eq(webhookEvents.id, event.id));
    reportError("Stripe webhook failed", error, { id: event.id, type: event.type });
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
