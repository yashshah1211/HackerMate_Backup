<!-- generated-by: gsd-doc-writer -->
# API Reference

This document details all HTTP API route handlers in HackerMate, including authentication methods, endpoint paths, request/response formats, error codes, and rate limits.

---

## Authentication

HackerMate employs several authentication schemes depending on the caller and sensitivity:

1. **User Session Authentication**: Client requests automatically carry Supabase session cookies or an `Authorization: Bearer <supabase-jwt>` header. Edge middleware (`src/middleware.ts`) and route handlers extract the current user using `supabase.auth.getUser()`.
2. **Administrator Role Guard**: Protected admin endpoints (`/api/admin/*`) require an active user session whose `profiles.role` column is `'admin'` or whose email matches the configured platform super-admin (`yashshah7117@gmail.com`).
3. **Cron Job Secret**: Scheduled tasks (`/api/cron/*`) require the header:
   ```http
   Authorization: Bearer <CRON_SECRET>
   ```
4. **Webhook Signatures**:
   - `/api/webhooks/notification`: Validated using `NOTIFICATION_WEBHOOK_SECRET` header.
   - `/api/webhooks/discord`: Cryptographically validated against Discord's Ed25519 signature headers (`X-Signature-Ed25519` and `X-Signature-Timestamp`) using `tweetnacl`.
   - `/api/webhooks/resend`: Validated using Svix webhook signing keys via `RESEND_WEBHOOK_SECRET`.

---

## Endpoints Overview

### Public Endpoints

| Method | Path | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/public-showcase` | Returns cached platform statistics, active hackathons, and featured teams. | None |
| `POST` | `/api/contact` | Handles user contact messages with honeypot validation and IP rate-limiting. | None |
| `GET` | `/api/certificates/verify` | Validates certificate authenticities via issuance hash and issuer signature. | None |
| `GET` | `/api/webhooks/email-open` | Serves a 1x1 transparent GIF tracking pixel for outreach campaign telemetry. | None |

### Authenticated User Endpoints

| Method | Path | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/send-email` | Dispatches transactional emails (invites, reminders) via Resend. | User Session |
| `POST` | `/api/upload/presign` | Generates presigned upload URLs for Cloudflare R2 / S3 storage. | User Session |
| `POST` | `/api/teams/[id]/ppt-evaluations` | Submits team slide decks for AI rubric evaluation and scoring. | Team Member |
| `GET` | `/api/teams/[id]/export` | Generates formatted Excel / PDF rosters for Smart India Hackathon (SIH) SPOC verification. | Team Member / Owner |

### Webhook Ingestion Endpoints

| Method | Path | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/webhooks/notification` | Receives Supabase database triggers to dispatch offline notification emails. | `NOTIFICATION_WEBHOOK_SECRET` |
| `POST` | `/api/webhooks/discord` | Ingests Discord bot interactions and executes slash commands (`/team`, `/hackathon`). | Discord Ed25519 Signature |
| `POST` | `/api/webhooks/resend` | Ingests email delivery, open, and bounce events from Resend. | `RESEND_WEBHOOK_SECRET` |

### Administrative Endpoints (`/api/admin/*`)

| Method | Path | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/organizer-leads` | Fetches filtered leads pipeline for hackathon organizers. | Admin Role |
| `POST` | `/api/admin/issue-badges` | Issues digital winner and runner-up badges to user profiles. | Admin Role |
| `POST` | `/api/admin/revoke-badge` | Revokes an erroneously issued badge. | Admin Role |
| `POST` | `/api/admin/scrape-unstop` | Manually triggers Unstop scraper to ingest external hackathons. | Admin Role |
| `POST` | `/api/admin/send-organizer-pitch` | Dispatches partnership pitch emails to scraped organizer leads. | Admin Role |
| `POST` | `/api/admin/send-outreach-summary-pdf` | Compiles and emails a daily outreach progress PDF summary. | Admin Role |
| `POST` | `/api/admin/create-partner-portal` | Creates co-branded partner page configurations (`/partners/[slug]`). | Admin Role |
| `GET` | `/api/admin/dashboard-data` | Aggregates daily registrations, active workspaces, and platform metrics. | Admin Role |

### Scheduled Cron Endpoints (`/api/cron/*`)

| Method | Path | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/cron/reminders` | Sends deadline notification alerts for saved hackathons. | `CRON_SECRET` |
| `GET` | `/api/cron/auto-scrape-leads` | Daily cron scraping upcoming hackathons and organizer contacts. | `CRON_SECRET` |
| `GET` | `/api/cron/daily-email-report` | Dispatches daily platform health summary to super-admin. | `CRON_SECRET` |
| `GET` | `/api/cron/database-activity-report` | Daily snapshot report of table growth and system activity. | `CRON_SECRET` |
| `GET` | `/api/cron/onboarding-nudge` | Sends reminder emails to users with incomplete onboarding. | `CRON_SECRET` |
| `GET` | `/api/cron/profile-nudges` | Prompts registered builders to link GitHub accounts and skills. | `CRON_SECRET` |
| `GET` | `/api/cron/analytics-summary` | Aggregates telemetry metrics into reporting tables. | `CRON_SECRET` |

---

## Request & Response Formats

### 1. Contact Submission (`POST /api/contact`)

#### Request Body
```json
{
  "name": "Arjun Sharma",
  "email": "arjun@example.com",
  "subject": "Platform Partnership Inquiry",
  "message": "We would like to list our national college hackathon on HackerMate.",
  "hp_field": ""
}
```
*(Note: `hp_field` is an anti-bot honeypot. Submissions with content in this field are silently accepted without sending emails.)*

#### Successful Response (`200 OK`)
```json
{
  "success": true,
  "message": "Message sent successfully"
}
```

### 2. Presigned Storage Upload URL (`POST /api/upload/presign`)

#### Request Body
```json
{
  "fileName": "pitch_deck_final.pdf",
  "fileType": "application/pdf",
  "fileSize": 4194304,
  "teamId": "a1b2c3d4-e5f6-7890-abcd-1234567890ab"
}
```

#### Successful Response (`200 OK`)
```json
{
  "success": true,
  "uploadUrl": "https://<account-id>.r2.cloudflarestorage.com/...",
  "publicUrl": "https://assets.hackermate.in/teams/a1b2.../pitch_deck_final.pdf",
  "key": "teams/a1b2.../pitch_deck_final.pdf"
}
```

---

## Error Handling & Status Codes

All API endpoints return standard JSON error envelopes on failure:

```json
{
  "error": "Descriptive reason for the failure",
  "code": "OPTIONAL_ERROR_CODE"
}
```

### Standard Status Codes:
- `200 OK`: Request succeeded.
- `400 Bad Request`: Missing required request fields, invalid payload format, or honeypot triggered.
- `401 Unauthorized`: Missing or invalid authentication token.
- `403 Forbidden`: Authenticated user lacks permission (e.g. non-admin accessing `/api/admin/*` or non-member accessing team assets).
- `404 Not Found`: Requested resource (team, certificate, hackathon) does not exist.
- `429 Too Many Requests`: Rate limit exceeded for the client IP or user account.
- `500 Internal Server Error`: Unhandled server-side exception or external API failure (e.g. Resend dispatch timeout).

---

## Rate Limiting

HackerMate implements database-backed atomic rate limiting using the PostgreSQL stored procedure `check_rate_limit`:

- **Contact Form (`/api/contact`)**: 5 submissions per 1-hour window per client IP address.
- **Outreach & Pitches (`/api/admin/send-organizer-pitch`)**: Enforces daily outreach budget guards (`lib/admin/emailBudgetGuard.ts`) preventing accidental overages beyond Resend daily quota limits.
- **Storage Presign (`/api/upload/presign`)**: Maximum file size strictly enforced at 25MB for pitch decks and 5MB for team logos.
