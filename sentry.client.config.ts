import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn:
    process.env.NEXT_PUBLIC_SENTRY_DSN ||
    "https://6d0dc2bde1222a1074b4f53ddd6f70f1@o4512114060623872.ingest.us.sentry.io/4512114074517504",

  // Tracing
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Session Replay
  replaysSessionSampleRate: 0.1, // Sample 10% of total user sessions
  replaysOnErrorSampleRate: 1.0, // Sample 100% of sessions whenever an unhandled error occurs

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Enabled in production or when explicitly configured with DSN
  enabled: process.env.NODE_ENV === "production" || Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
});
