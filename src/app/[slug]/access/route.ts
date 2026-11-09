import { type NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { publications, subscribers } from "@/db/schema";
import { accessCookie, cookieOptions, PAID_COOKIE } from "@/lib/paid-access";
import { verify } from "@/lib/signed";

/** The link in a paid reader's login email: unlocks paid posts in this browser. */
export async function GET(request: NextRequest, { params }: RouteContext<"/[slug]/access">) {
  const { slug } = await params;
  const id = verify("paid-login", request.nextUrl.searchParams.get("t"));
  const nextParam = request.nextUrl.searchParams.get("next") ?? "";
  const next = /^\/[\w\-/]*$/.test(nextParam) ? nextParam : `/${slug}`;
  const [reader] = id
    ? await db
        .select({ id: subscribers.id, slug: publications.slug })
        .from(subscribers)
        .innerJoin(publications, eq(publications.id, subscribers.publicationId))
        .where(eq(subscribers.id, id))
    : [];
  if (!reader || reader.slug !== slug) {
    return new NextResponse("This link has expired. Ask for a new one under any paid post.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.set(
    PAID_COOKIE(slug),
    accessCookie(reader.id),
    cookieOptions(request.nextUrl.protocol === "https:"),
  );
  return response;
}
