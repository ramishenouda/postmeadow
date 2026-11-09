import * as Sentry from "@sentry/nextjs";

/**
 * Runs once when a Next.js server starts: error monitoring (if SENTRY_DSN is set),
 * then the scheduler (scheduled sends and picking up interrupted sends), but not
 * while building and not in the Edge runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.SENTRY_DSN) {
    const { sentryOptions } = await import("./lib/sentry-options");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      ...sentryOptions,
    });
  }
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}

/** Errors while rendering pages, route handlers and server actions. */
export const onRequestError = Sentry.captureRequestError;
