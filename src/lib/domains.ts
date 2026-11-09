import "server-only";
import { resolve4, resolveCname } from "node:dns/promises";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { publications } from "@/db/schema";
import { env } from "@/env";

/**
 * A publication's own web address, e.g. news.brand.com. The writer points it at us
 * with a CNAME (or A records for a bare domain); once verified, the proxy serves the
 * publication there (src/proxy.ts) and Caddy gets it a certificate on demand
 * (/api/domains/check). Emails and feeds link to it.
 */

export const appHost = () => new URL(env.APP_URL).host.toLowerCase();

/** Where custom domains should point: CUSTOM_DOMAIN_TARGET, or the app's own host. */
export const domainTarget = () =>
  (process.env.CUSTOM_DOMAIN_TARGET || new URL(env.APP_URL).hostname).toLowerCase();

/** "https://News.Brand.com/x" → "news.brand.com", or null if it isn't a usable host name. */
export function normalizeDomain(input: string): string | null {
  let host = input.trim().toLowerCase();
  if (!host) return null;
  try {
    host = new URL(host.includes("://") ? host : `https://${host}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/\.$/, "");
  const labels = host.split(".");
  if (labels.length < 2 || host.length > 253) return null;
  if (!labels.every((l) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l))) return null;
  if (/^\d+$/.test(labels[labels.length - 1])) return null; // an IP address
  const ours = new URL(env.APP_URL).hostname.toLowerCase();
  if (host === ours || host.endsWith(`.${ours}`)) return null;
  return host;
}

/** Does the domain's DNS point at us? */
export async function dnsPointsHere(domain: string): Promise<boolean> {
  if (process.env.CUSTOM_DOMAIN_SKIP_DNS === "1") return true; // tests only
  const target = domainTarget();
  const cnames = await resolveCname(domain).catch(() => [] as string[]);
  if (cnames.some((c) => c.replace(/\.$/, "").toLowerCase() === target)) return true;
  const [theirs, ours] = await Promise.all([
    resolve4(domain).catch(() => [] as string[]),
    resolve4(target).catch(() => [] as string[]),
  ]);
  return theirs.length > 0 && theirs.every((ip) => ours.includes(ip));
}

/** The verified publication at this host name, if any. */
export async function publicationForDomain(host: string) {
  const domain = host.toLowerCase().replace(/:\d+$/, "");
  const [row] = await db
    .select({ slug: publications.slug })
    .from(publications)
    .where(
      and(eq(publications.customDomain, domain), isNotNull(publications.customDomainVerifiedAt)),
    );
  return row ?? null;
}

/** The domain to link to, if it's verified. */
export const liveDomain = (p: {
  customDomain?: string | null;
  customDomainVerifiedAt?: Date | null;
}) => (p.customDomain && p.customDomainVerifiedAt ? p.customDomain : null);
