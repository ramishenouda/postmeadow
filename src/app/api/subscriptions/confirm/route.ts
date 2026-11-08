import { after, type NextRequest, NextResponse } from "next/server";
import { confirmSubscription } from "@/lib/subscribers";
import { sendWelcomeEmail } from "@/lib/welcome";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const confirmed = token ? await confirmSubscription(token) : null;
  if (confirmed) {
    // Don't make the reader wait for an email to be sent.
    after(() =>
      sendWelcomeEmail(confirmed.subscriberId).catch((e) =>
        console.error("welcome email failed", e),
      ),
    );
  }
  const target = confirmed ? `/${confirmed.slug}/subscribed` : "/subscription-invalid";
  return NextResponse.redirect(new URL(target, request.url), 303);
}
