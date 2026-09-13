<!-- generated-by: gsd-doc-writer -->
# Configuration Guide

This guide details all environment variables, configuration files, and runtime settings required to run, build, and deploy HackerMate.

---

## Environment Variables

HackerMate consumes environment variables via Next.js standard environment files. For local development, copy your settings to `frontend/.env.local`. Variables prefixed with `NEXT_PUBLIC_` are bundled into client-side code and accessible in the browser, while non-prefixed variables remain strictly server-side.

### Core Database & Authentication (Required)

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | **Required** | `None` | The HTTPS URL of your Supabase project instance (e.g. `https://xyzcompany.supabase.co`). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Required** | `None` | The public anonymous key for browser-level queries subject to Row-Level Security. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required** | `None` | Elevated service role key used exclusively by serverless route handlers (`/api/*`) and cron workers to bypass RLS for admin operations. |

### Application & Site Settings

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_SITE_URL` | Optional | `https://hackermate.in` | Canonical public base URL used for link generation, invite previews, and OpenGraph metadata. |
| `NEXT_PUBLIC_GA_ID` | Optional | `None` | Google Analytics 4 tracking measurement ID. |

### Email Service (Resend)

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `RESEND_API_KEY` | Optional | `None` | API key from [Resend](https://resend.com) for sending transactional emails (team invitations, join requests, and outreach summaries). |
| `RESEND_FROM_EMAIL` | Optional | `HackerMate <onboarding@resend.dev>` | The verified sender address displayed on transactional outbound emails. |
| `RESEND_SANDBOX_RECIPIENT` | Optional | `None` | Overrides outgoing email recipients during testing to divert all emails to a designated test address. |
| `OUTREACH_REPLY_TO_EMAIL` | Optional | `None` | Email address configured as the `Reply-To` header on organizer pitches and automated digests. |

### Security & Scheduled Tasks

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `CRON_SECRET` | **Required (Prod)** | `None` | Secret bearer token required to authenticate Vercel Cron triggers hitting `/api/cron/*`. |
| `NOTIFICATION_WEBHOOK_SECRET` | **Required (Prod)** | `None` | Shared HMAC secret validating incoming database webhook calls to `/api/webhooks/notification`. |

### Cloud Storage (Cloudflare R2 / S3 API)

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `R2_ACCOUNT_ID` | Optional | `None` | Cloudflare account ID for object storage. <!-- VERIFY: Cloudflare R2 Account ID --> |
| `R2_ACCESS_KEY_ID` | Optional | `None` | Access key for S3-compatible R2 bucket presigned uploads. |
| `R2_SECRET_ACCESS_KEY` | Optional | `None` | Secret key for S3-compatible R2 bucket presigned uploads. |
| `R2_BUCKET_NAME` | Optional | `None` | Storage bucket name for team pitch decks, certificates, and logos. |
| `R2_PUBLIC_URL` | Optional | `None` | Public CDN URL serving uploaded bucket assets. <!-- VERIFY: R2 CDN Domain --> |

### Telemetry & Analytics (PostHog)

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_POSTHOG_KEY` | Optional | `None` | Project API key for client-side PostHog product telemetry. |
| `NEXT_PUBLIC_POSTHOG_HOST` | Optional | `https://app.posthog.com` | Host endpoint for PostHog analytics ingestion. |
| `POSTHOG_PERSONAL_API_KEY` | Optional | `None` | Personal API key for querying server-side PostHog event cohorts. |
| `POSTHOG_PROJECT_ID` | Optional | `None` | Project identifier within PostHog workspace. |

### External Integrations & Bot APIs

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | Optional | `None` | Google Gemini API key for pitch evaluation engine and automatic content moderation. |
| `DISCORD_APPLICATION_ID` | Optional | `None` | Discord developer application ID for bot integration. |
| `DISCORD_PUBLIC_KEY` | Optional | `None` | Public key for verifying Discord interaction webhooks. |
| `DISCORD_BOT_TOKEN` | Optional | `None` | Bot token used to dispatch notifications to Discord server channels. |
| `GMAIL_CLIENT_ID` | Optional | `None` | Google OAuth client ID for administrative outreach pipelines. <!-- VERIFY: Google Cloud OAuth app credentials --> |
| `GMAIL_CLIENT_SECRET` | Optional | `None` | Google OAuth client secret for outreach pipelines. |
| `GMAIL_REFRESH_TOKEN` | Optional | `None` | Long-lived OAuth refresh token authorizing Gmail API dispatch. |
| `ADMIN_CONTACT_EMAIL` | Optional | `None` | Primary inbox receiving user contact submissions and moderation alerts. |
| `OUTREACH_ADMIN_EMAIL` | Optional | `None` | Super-admin email permitted to access outreach automation endpoints. |

---

## Configuration Files

### 1. Next.js Configuration (`frontend/next.config.ts`)
Controls bundle optimization, development origin security, and canonical URL redirection rewrites:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns"],
  },
  allowedDevOrigins: ["192.168.0.100"],
  async redirects() {
    return [
      { source: "/builders", destination: "/developers", permanent: true },
      { source: "/builders/:id", destination: "/profile/:id", permanent: true },
      { source: "/developer/:id", destination: "/profile/:id", permanent: true },
      { source: "/developers/:id", destination: "/profile/:id", permanent: true },
      { source: "/team/:id", destination: "/teams/:id", permanent: true },
      { source: "/team/:id/workspace", destination: "/teams/:id/workspace", permanent: true },
      { source: "/hackathon/:id", destination: "/hackathons/:id", permanent: true },
    ];
  },
};

export default nextConfig;
```

### 2. Vercel Cron & Project Configuration (`frontend/vercel.json`)
Defines recurring serverless cron jobs running on Vercel's edge infrastructure:

```json
{
  "crons": [
    {
      "path": "/api/cron/database-activity-report",
      "schedule": "30 3 * * *"
    },
    {
      "path": "/api/cron/auto-scrape-leads",
      "schedule": "30 3 * * *"
    }
  ]
}
```

### 3. Styling & PostCSS (`frontend/src/app/globals.css`)
HackerMate uses Tailwind CSS v4, which eliminates the legacy `tailwind.config.js` file in favor of direct CSS imports:

```css
@import "tailwindcss";
```

### 4. TypeScript Compiler Configuration (`frontend/tsconfig.json`)
Configures path aliases (`@/*` mapping to `./src/*`), strict type checking, and JSX transformation:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```
