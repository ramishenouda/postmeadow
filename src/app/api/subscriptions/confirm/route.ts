import { type NextRequest, NextResponse } from "next/server";
import { confirmSubscription } from "@/lib/subscribers";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const slug = token ? await confirmSubscription(token) : null;
  const target = slug ? `/${slug}/subscribed` : "/subscription-invalid";
  return NextResponse.redirect(new URL(target, request.url), 303);
}
