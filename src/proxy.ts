import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Two jobs:
 *
 * 1. On the app's own host: an optimistic sign-in check for the dashboard, onboarding
 *    and admin (no session cookie at all → sign-in page). The real session check
 *    happens in the Data Access Layer (src/lib/dal.ts).
 * 2. On a publication's own domain (news.brand.com): serve that publication. "/" shows
 *    its page, "/p/…" its posts, and so on (rewritten to /{slug}/…); shared routes
 *    (assets, APIs, unsubscribe pages, embeds) work as they are.
 */

const APP_HOST = new URL(process.env.APP_URL ?? "http://localhost:3000").host.toLowerCase();

/** Paths that are the same on every host. */
const SHARED = new Set([
  "_next",
  "api",
  "media",
  "embed",
  "unsubscribe",
  "invite",
  "sponsor",
  "previews",
  "templates",
  "subscription-invalid",
  "favicon.ico",
  "robots.txt",
]);
/** App pages that only make sense on the app's own host. */
const APP_ONLY = new Set([
  "dashboard",
  "onboarding",
  "admin",
  "sign-in",
  "pricing",
  "terms",
  "privacy",
  "account-deleted",
  "sitemap.xml",
]);

/** host → slug (or null), for a minute; domains change rarely. */
const domains = new Map<string, { slug: string | null; at: number }>();
const TTL_MS = 60_000;

async function slugForHost(host: string): Promise<string | null> {
  const hit = domains.get(host);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.slug;
  // Asked over HTTP: the proxy stays free of database code.
  let slug: string | null = null;
  try {
    const port = process.env.PORT ?? "3000";
    const res = await fetch(
      `http://127.0.0.1:${port}/api/domains/lookup?domain=${encodeURIComponent(host)}`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (res.ok) slug = ((await res.json()) as { slug: string | null }).slug;
  } catch {
    return null; // not cached: try again next time
  }
  if (domains.size > 5000) domains.clear();
  domains.set(host, { slug, at: Date.now() });
  return slug;
}

/** The app itself: its configured host, or an internal name/IP (health checks, tests). */
function isAppHost(host: string): boolean {
  const name = host.replace(/:\d+$/, "");
  return host === APP_HOST || !name.includes(".") || /^[\d.]+$/.test(name) || name.startsWith("[");
}

export async function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const { pathname, search } = request.nextUrl;
  const first = pathname.split("/")[1] ?? "";

  if (!isAppHost(host)) {
    const slug = await slugForHost(host.replace(/:\d+$/, ""));
    if (slug) {
      if (SHARED.has(first)) return NextResponse.next();
      if (APP_ONLY.has(first)) {
        return NextResponse.redirect(new URL(pathname + search, `https://${APP_HOST}`));
      }
      // Links that include the slug (/{slug}/p/…) go to the short address.
      if (first === slug) {
        const rest = pathname.slice(slug.length + 1) || "/";
        const url = request.nextUrl.clone();
        url.pathname = rest;
        return NextResponse.redirect(url, 308);
      }
      const url = request.nextUrl.clone();
      url.pathname = `/${slug}${pathname === "/" ? "" : pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  if (first === "dashboard" || first === "onboarding" || first === "admin") {
    if (!getSessionCookie(request)) {
      const url = new URL("/sign-in", request.url);
      // Come back here after signing in (e.g. pricing page → billing).
      if (pathname !== "/dashboard") url.searchParams.set("next", pathname + search);
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  // Everything except build assets: custom domains can ask for any path.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
