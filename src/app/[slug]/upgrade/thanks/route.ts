import { type NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { publications, subscribers } from "@/db/schema";
import { getStripe } from "@/lib/billing/stripe";
import { applyReaderSubscription } from "@/lib/paid";
import { accessCookie, cookieOptions, PAID_COOKIE } from "@/lib/paid-access";
import { reportError } from "@/lib/report";

/**
 * Stripe Checkout's success URL. Applies the subscription right away (the webhook does
 * the same, whichever comes first), unlocks paid posts in this browser and shows the
 * thank-you page.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/[slug]/upgrade/thanks">,
) {
  const { slug } = await params;
  const sessionId = request.nextUrl.searchParams.get("session_id") ?? "";
  const stripe = getStripe();
  const done = NextResponse.redirect(new URL(`/${slug}?upgraded=1`, request.url), 303);
  if (!stripe || !/^cs_[\w]+$/.test(sessionId)) return done;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });
    const [publication] = await db
      .select({ id: publications.id })
      .from(publications)
      .where(eq(publications.slug, slug));
    if (
      !publication ||
      session.metadata?.kind !== "reader" ||
      session.metadata.publicationId !== publication.id ||
      session.status !== "complete"
    ) {
      return done;
    }
    if (session.subscription && typeof session.subscription === "object") {
      await applyReaderSubscription(session.subscription);
    }
    const email = session.metadata.email?.toLowerCase() ?? "";
    const [reader] = await db
      .select({ id: subscribers.id })
      .from(subscribers)
      .where(and(eq(subscribers.publicationId, publication.id), eq(subscribers.email, email)));
    if (reader) {
      done.cookies.set(
        PAID_COOKIE(slug),
        accessCookie(reader.id),
        cookieOptions(request.nextUrl.protocol === "https:"),
      );
    }
  } catch (error) {
    reportError("checkout return failed", error);
  }
  return done;
}
