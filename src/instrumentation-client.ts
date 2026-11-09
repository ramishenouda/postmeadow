// Browser errors, when NEXT_PUBLIC_SENTRY_DSN was set at build time (the DSN isn't secret).
// Loaded only then, so the SDK adds nothing to the page otherwise.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void Promise.all([import("@sentry/nextjs"), import("./lib/sentry-options")]).then(
    ([Sentry, { sentryOptions }]) =>
      Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, ...sentryOptions }),
  );
}
