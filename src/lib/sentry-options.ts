import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Shared Sentry settings: errors only, and no personal data (the privacy policy
 * promises this). Unsubscribe, invitation and confirmation links carry secret
 * tokens in their paths, so long token-like segments are blanked out too.
 */
const TOKEN = /[A-Za-z0-9_-]{20,}/g;

const scrub = (s: string | undefined) => s?.replace(TOKEN, "[token]");

export const sentryOptions = {
  tracesSampleRate: 0,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
  },
  beforeSend(event: ErrorEvent) {
    delete event.user;
    if (event.request) {
      event.request.url = scrub(event.request.url);
      delete event.request.cookies;
      delete event.request.headers;
      delete event.request.data;
      delete event.request.query_string;
    }
    event.transaction = scrub(event.transaction);
    return event;
  },
};
