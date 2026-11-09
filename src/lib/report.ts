import "server-only";
import * as Sentry from "@sentry/nextjs";

/**
 * For errors we catch and carry on from (background sends, emails, the scheduler):
 * logged, and sent to Sentry when it's configured, so they don't go unnoticed.
 */
export function reportError(message: string, error: unknown, extra?: Record<string, unknown>) {
  console.error(message, extra ?? "", error);
  Sentry.captureException(error, { extra: { message, ...extra } });
}
