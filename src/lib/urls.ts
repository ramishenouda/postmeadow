import "server-only";
import { env } from "@/env";

export const absoluteUrl = (path: string) => new URL(path, env.APP_URL).toString();

export const publicationUrl = (slug: string) => absoluteUrl(`/${slug}`);
export const postUrl = (slug: string, postSlug: string) => absoluteUrl(`/${slug}/p/${postSlug}`);
export const confirmUrl = (token: string) =>
  absoluteUrl(`/api/subscriptions/confirm?token=${encodeURIComponent(token)}`);
/** Human-facing page with an "Unsubscribe" button (used in the email footer). */
export const unsubscribePageUrl = (token: string) => absoluteUrl(`/unsubscribe/${token}`);
/** RFC 8058 one-click endpoint (used in the List-Unsubscribe header). */
export const unsubscribeOneClickUrl = (token: string) => absoluteUrl(`/api/unsubscribe/${token}`);
