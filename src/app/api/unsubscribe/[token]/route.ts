import { NextResponse } from "next/server";
import { unsubscribeByToken } from "@/lib/subscribers";

/**
 * RFC 8058 one-click unsubscribe. Mail clients (Gmail, Apple Mail…) POST here
 * when the reader clicks their built-in "Unsubscribe" button.
 */
export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/unsubscribe/[token]">,
) {
  const { token } = await params;
  const ok = await unsubscribeByToken(token);
  return new NextResponse(null, { status: ok ? 200 : 404 });
}

/** A person opening the header URL in a browser gets the normal page. */
export async function GET(request: Request, { params }: RouteContext<"/api/unsubscribe/[token]">) {
  const { token } = await params;
  return NextResponse.redirect(new URL(`/unsubscribe/${token}`, request.url), 303);
}
