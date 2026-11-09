import { after, type NextRequest, NextResponse } from "next/server";
import { confirmSubscription } from "@/lib/subscribers";
import { sendWelcomeEmail } from "@/lib/welcome";
import { reportError } from "@/lib/report";
import { creditReferral } from "@/lib/referrals";
import { enrollOnConfirm } from "@/lib/automations";
import { sign } from "@/lib/signed";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const confirmed = token ? await confirmSubscription(token) : null;
  if (confirmed) {
    // Don't make the reader wait for an email to be sent.
    after(() =>
      sendWelcomeEmail(confirmed.subscriberId).catch((e) => reportError("welcome email failed", e)),
    );
    after(() =>
      enrollOnConfirm(confirmed.subscriberId).catch((e) =>
        reportError("automation enroll failed", e),
      ),
    );
    after(() =>
      creditReferral(confirmed.subscriberId).catch((e) => reportError("referral credit failed", e)),
    );
  }
  // The "you're subscribed" page may offer recommendations and the reader's referral link,
  // so it gets a short-lived proof of who just confirmed.
  const target = confirmed
    ? `/${confirmed.slug}/subscribed?w=${sign("welcome", confirmed.subscriberId, 60 * 60)}`
    : "/subscription-invalid";
  return NextResponse.redirect(new URL(target, request.url), 303);
}
