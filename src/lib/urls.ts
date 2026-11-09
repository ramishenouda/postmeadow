import "server-only";
import { env } from "@/env";

export const absoluteUrl = (path: string) => new URL(path, env.APP_URL).toString();

/** The publication's page: on its own domain when it has a verified one. */
export const publicationUrl = (slug: string, domain?: string | null) =>
  domain ? `https://${domain}/` : absoluteUrl(`/${slug}`);
export const postUrl = (slug: string, postSlug: string, domain?: string | null) =>
  domain ? `https://${domain}/p/${postSlug}` : absoluteUrl(`/${slug}/p/${postSlug}`);
export const confirmUrl = (token: string) =>
  absoluteUrl(`/api/subscriptions/confirm?token=${encodeURIComponent(token)}`);
/** Human-facing page with an "Unsubscribe" button (used in the email footer). */
export const unsubscribePageUrl = (token: string) => absoluteUrl(`/unsubscribe/${token}`);
/** RFC 8058 one-click endpoint (used in the List-Unsubscribe header). */
export const unsubscribeOneClickUrl = (token: string) => absoluteUrl(`/api/unsubscribe/${token}`);
/** Public URL of an uploaded file. Absolute, because emails need full URLs. */
export const mediaUrl = (key: string) => absoluteUrl(`/media/${key}`);

/** Where readers become paid subscribers. */
export const upgradeUrl = (slug: string, domain?: string | null) =>
  domain ? `https://${domain}/upgrade` : absoluteUrl(`/${slug}/upgrade`);
