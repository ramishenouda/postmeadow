import { eq } from "drizzle-orm";
import { Webhook, WebhookVerificationError } from "standardwebhooks";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { env } from "@/env";
import { handleResendEvent, type ResendEvent } from "@/lib/webhooks/resend";

/**
 * Resend webhook: bounces, spam complaints and suppressions.
 * Configure in Resend → Webhooks with the email.bounced, email.complained,
 * email.suppressed and email.failed events, and put the signing secret in
 * RESEND_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  if (!env.RESEND_WEBHOOK_SECRET) {
    return Response.json({ error: "Webhook not configured" }, { status: 503 });
  }

  // Resend signs with Svix, which uses either svix-* or webhook-* header names.
  const h = request.headers;
  const id = h.get("svix-id") ?? h.get("webhook-id");
  const timestamp = h.get("svix-timestamp") ?? h.get("webhook-timestamp");
  const signature = h.get("svix-signature") ?? h.get("webhook-signature");
  if (!id || !timestamp || !signature) {
    return Response.json({ error: "Missing signature headers" }, { status: 400 });
  }

  const payload = await request.text();
  let event: ResendEvent;
  try {
    event = new Webhook(env.RESEND_WEBHOOK_SECRET).verify(payload, {
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": signature,
    }) as ResendEvent;
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }
    throw error;
  }

  // Providers retry; process each event once.
  const fresh = await db
    .insert(webhookEvents)
    .values({ id, type: event.type })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (fresh.length === 0) return Response.json({ ok: true, duplicate: true });

  try {
    const result = await handleResendEvent(event);
    return Response.json({ ok: true, result });
  } catch (error) {
    // Forget the event so the provider's retry is processed.
    await db.delete(webhookEvents).where(eq(webhookEvents.id, id));
    console.error("Resend webhook failed", { id, type: event.type, error });
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
