import { type NextRequest, NextResponse } from "next/server";
import { commenterCookie, confirmComment } from "@/lib/comments";

/** The link in a "confirm your comment" email: publishes it and remembers the browser. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const confirmed = token ? await confirmComment(token) : null;
  if (!confirmed) {
    return new NextResponse(
      "This link has already been used, or it isn't complete. Your comment may already be published.",
      { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
  const response = NextResponse.redirect(
    new URL(`/${confirmed.publicationSlug}/p/${confirmed.slug}#comments`, request.url),
    303,
  );
  response.cookies.set(commenterCookie(confirmed.publicationSlug), confirmed.commenterToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: `/${confirmed.publicationSlug}`,
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
