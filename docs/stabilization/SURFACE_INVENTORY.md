# Application surface inventory

Source inventory at `652d1ef`, 2026-11-05. This enumerates surfaces; an entry is not a security sign-off. Labels describe visible calls/imports, not proof of authorization.

56 pages; 51 route handlers; 161 migration files.

## Pages

| Route | Source | Visible boundary |
| --- | --- | --- |
| `/admin/attention` | `src/app/admin/attention/page.tsx` | AuthGuard |
| `/admin` | `src/app/admin/page.tsx` | AuthGuard |
| `/connections` | `src/app/connections/page.tsx` | AuthGuard |
| `/contact` | `src/app/contact/page.tsx` | Inspect parent/layout/delegated component |
| `/dashboard` | `src/app/dashboard/page.tsx` | AuthGuard |
| `/dev/v2/builders` | `src/app/dev/v2/builders/page.tsx` | Inspect parent/layout/delegated component |
| `/dev/v2/dashboard` | `src/app/dev/v2/dashboard/page.tsx` | Inspect parent/layout/delegated component |
| `/dev/v2` | `src/app/dev/v2/page.tsx` | Inspect parent/layout/delegated component |
| `/dev/v2/profile` | `src/app/dev/v2/profile/page.tsx` | Inspect parent/layout/delegated component |
| `/dev/v2/teams` | `src/app/dev/v2/teams/page.tsx` | Inspect parent/layout/delegated component |
| `/dev/v2/workspace` | `src/app/dev/v2/workspace/page.tsx` | Inspect parent/layout/delegated component |
| `/dev/v2/workspace-live` | `src/app/dev/v2/workspace-live/page.tsx` | Inspect parent/layout/delegated component |
| `/developers` | `src/app/developers/page.tsx` | AuthGuard |
| `/expo/judge` | `src/app/expo/judge/page.tsx` | Inspect parent/layout/delegated component |
| `/expo/leaderboard` | `src/app/expo/leaderboard/page.tsx` | Inspect parent/layout/delegated component |
| `/expo/printables/builders` | `src/app/expo/printables/builders/page.tsx` | Inspect parent/layout/delegated component |
| `/expo/printables/challenges` | `src/app/expo/printables/challenges/page.tsx` | Inspect parent/layout/delegated component |
| `/expo/printables/flyer` | `src/app/expo/printables/flyer/page.tsx` | Inspect parent/layout/delegated component |
| `/expo/printables/poster` | `src/app/expo/printables/poster/page.tsx` | Inspect parent/layout/delegated component |
| `/expo/printables/qr-sign` | `src/app/expo/printables/qr-sign/page.tsx` | Inspect parent/layout/delegated component |
| `/expo/printables/rules` | `src/app/expo/printables/rules/page.tsx` | Inspect parent/layout/delegated component |
| `/expo/printables/team-mat` | `src/app/expo/printables/team-mat/page.tsx` | Inspect parent/layout/delegated component |
| `/faq` | `src/app/faq/page.tsx` | Inspect parent/layout/delegated component |
| `/hackathons/[id]/organizer` | `src/app/hackathons/[id]/organizer/page.tsx` | AuthGuard |
| `/hackathons/[id]` | `src/app/hackathons/[id]/page.tsx` | BrowsingBoundary, PublicHackathon |
| `/hackathons/create` | `src/app/hackathons/create/page.tsx` | AuthGuard |
| `/hackathons` | `src/app/hackathons/page.tsx` | BrowsingBoundary |
| `/invites` | `src/app/invites/page.tsx` | Inspect parent/layout/delegated component |
| `/leaderboard` | `src/app/leaderboard/page.tsx` | Inspect parent/layout/delegated component |
| `/login` | `src/app/login/page.tsx` | Inspect parent/layout/delegated component |
| `/messages` | `src/app/messages/page.tsx` | AuthGuard |
| `/my-teams` | `src/app/my-teams/page.tsx` | AuthGuard |
| `/notifications` | `src/app/notifications/page.tsx` | AuthGuard |
| `/onboarding` | `src/app/onboarding/page.tsx` | Inspect parent/layout/delegated component |
| `/` | `src/app/page.tsx` | Inspect parent/layout/delegated component |
| `/partners/[slug]/organizer` | `src/app/partners/[slug]/organizer/page.tsx` | Inspect parent/layout/delegated component |
| `/partners/[slug]` | `src/app/partners/[slug]/page.tsx` | Inspect parent/layout/delegated component |
| `/partners/craftncode/[state]` | `src/app/partners/craftncode/[state]/page.tsx` | Inspect parent/layout/delegated component |
| `/partners/craftncode` | `src/app/partners/craftncode/page.tsx` | Inspect parent/layout/delegated component |
| `/partners/hustle-carnival` | `src/app/partners/hustle-carnival/page.tsx` | Inspect parent/layout/delegated component |
| `/partners/hustle-carnival/workshops` | `src/app/partners/hustle-carnival/workshops/page.tsx` | Inspect parent/layout/delegated component |
| `/partners` | `src/app/partners/page.tsx` | Inspect parent/layout/delegated component |
| `/privacy` | `src/app/privacy/page.tsx` | Inspect parent/layout/delegated component |
| `/profile/[id]` | `src/app/profile/[id]/page.tsx` | Inspect parent/layout/delegated component |
| `/profile/edit` | `src/app/profile/edit/page.tsx` | AuthGuard |
| `/sentry-test` | `src/app/sentry-test/page.tsx` | Inspect parent/layout/delegated component |
| `/settings` | `src/app/settings/page.tsx` | AuthGuard |
| `/teams/[id]/dashboard` | `src/app/teams/[id]/dashboard/page.tsx` | Inspect parent/layout/delegated component |
| `/teams/[id]` | `src/app/teams/[id]/page.tsx` | Inspect parent/layout/delegated component |
| `/teams/[id]/requests` | `src/app/teams/[id]/requests/page.tsx` | AuthGuard |
| `/teams/[id]/workspace` | `src/app/teams/[id]/workspace/page.tsx` | Inspect parent/layout/delegated component |
| `/teams/create` | `src/app/teams/create/page.tsx` | AuthGuard |
| `/teams` | `src/app/teams/page.tsx` | AuthGuard |
| `/terms` | `src/app/terms/page.tsx` | Inspect parent/layout/delegated component |
| `/tools/ppt-evaluator` | `src/app/tools/ppt-evaluator/page.tsx` | Inspect parent/layout/delegated component |
| `/verify/[id]` | `src/app/verify/[id]/page.tsx` | Inspect parent/layout/delegated component |

## Route handlers

| Path | Methods | Source | Visible boundary signals |
| --- | --- | --- | --- |
| `/api/admin/attention` | GET | `src/app/api/admin/attention/route.ts` | requireAdmin |
| `/api/admin/ban-user` | POST | `src/app/api/admin/ban-user/route.ts` | requireAdmin |
| `/api/admin/create-partner-portal` | POST | `src/app/api/admin/create-partner-portal/route.ts` | requireAdmin |
| `/api/admin/dashboard-data` | GET | `src/app/api/admin/dashboard-data/route.ts` | requireAdmin |
| `/api/admin/delete-user` | POST | `src/app/api/admin/delete-user/route.ts` | requireAdmin, getUser |
| `/api/admin/deleted-users-log` | GET | `src/app/api/admin/deleted-users-log/route.ts` | requireOutreachAdmin |
| `/api/admin/email-analytics` | GET | `src/app/api/admin/email-analytics/route.ts` | requireAdmin, Webhook |
| `/api/admin/hackathons` | GET, POST | `src/app/api/admin/hackathons/route.ts` | requireAdmin |
| `/api/admin/issue-badges` | POST, GET | `src/app/api/admin/issue-badges/route.ts` | requireAdmin |
| `/api/admin/nudge-incomplete-onboarding` | POST | `src/app/api/admin/nudge-incomplete-onboarding/route.ts` | requireAdmin, getUser |
| `/api/admin/organizer-leads/mark-replied` | POST | `src/app/api/admin/organizer-leads/mark-replied/route.ts` | requireOutreachAdmin |
| `/api/admin/organizer-leads/remove` | POST | `src/app/api/admin/organizer-leads/remove/route.ts` | requireOutreachAdmin |
| `/api/admin/organizer-leads/restore` | POST | `src/app/api/admin/organizer-leads/restore/route.ts` | requireOutreachAdmin |
| `/api/admin/organizer-leads/sync-gmail-replies` | POST | `src/app/api/admin/organizer-leads/sync-gmail-replies/route.ts` | requireOutreachAdmin |
| `/api/admin/organizer-leads/update-status` | POST | `src/app/api/admin/organizer-leads/update-status/route.ts` | requireOutreachAdmin |
| `/api/admin/partner-composition` | GET | `src/app/api/admin/partner-composition/route.ts` | requireAdmin |
| `/api/admin/partner-config` | GET, POST, PATCH | `src/app/api/admin/partner-config/route.ts` | requireAdmin |
| `/api/admin/partner-organizers` | GET, POST, DELETE | `src/app/api/admin/partner-organizers/route.ts` | requireAdmin, getUser |
| `/api/admin/revoke-badge` | DELETE | `src/app/api/admin/revoke-badge/route.ts` | requireAdmin |
| `/api/admin/scrape-unstop` | POST | `src/app/api/admin/scrape-unstop/route.ts` | requireOutreachAdmin |
| `/api/admin/send-organizer-pitch` | POST | `src/app/api/admin/send-organizer-pitch/route.ts` | requireOutreachAdmin |
| `/api/admin/send-outreach-summary-pdf` | POST | `src/app/api/admin/send-outreach-summary-pdf/route.ts` | requireOutreachAdmin |
| `/api/admin/sync-email-stats` | POST | `src/app/api/admin/sync-email-stats/route.ts` | requireAdmin |
| `/api/builder-track-record/[id]` | GET | `src/app/api/builder-track-record/[id]/route.ts` | getUser |
| `/api/certificates/verify/[id]` | GET | `src/app/api/certificates/verify/[id]/route.ts` | Inspect implementation/delegated handler |
| `/api/contact` | POST | `src/app/api/contact/route.ts` | Inspect implementation/delegated handler |
| `/api/cron/analytics-summary` | GET, POST | `src/app/api/cron/analytics-summary/route.ts` | CRON_SECRET |
| `/api/cron/auto-scrape-leads` | GET | `src/app/api/cron/auto-scrape-leads/route.ts` | CRON_SECRET |
| `/api/cron/daily-email-report` | POST, GET | `src/app/api/cron/daily-email-report/route.ts` | CRON_SECRET |
| `/api/cron/database-activity-report` | GET, POST | `src/app/api/cron/database-activity-report/route.ts` | requireAdmin, CRON_SECRET |
| `/api/cron/hustle-round2-once` | GET | `src/app/api/cron/hustle-round2-once/route.ts` | handleAutodispatch |
| `/api/cron/onboarding-nudge` | GET, POST | `src/app/api/cron/onboarding-nudge/route.ts` | Inspect implementation/delegated handler |
| `/api/cron/profile-nudges` | GET, POST | `src/app/api/cron/profile-nudges/route.ts` | Inspect implementation/delegated handler |
| `/api/cron/reminders` | POST | `src/app/api/cron/reminders/route.ts` | CRON_SECRET |
| `/api/link-preview` | GET | `src/app/api/link-preview/route.ts` | fetchPublicHtml |
| `/api/organizer/broadcast` | POST | `src/app/api/organizer/broadcast/route.ts` | requireAdmin, requireVerifiedProfile |
| `/api/partners/[slug]/organizer/export` | GET | `src/app/api/partners/[slug]/organizer/export/route.ts` | requirePartnerAccess |
| `/api/partners/[slug]/organizer` | GET | `src/app/api/partners/[slug]/organizer/route.ts` | requirePartnerAccess |
| `/api/partners/hustle-carnival/phase-2/[action]` | GET, POST | `src/app/api/partners/hustle-carnival/phase-2/[action]/route.ts` | handleApi |
| `/api/send-email` | POST | `src/app/api/send-email/route.ts` | requireAdmin, getUser |
| `/api/sentry-test` | GET | `src/app/api/sentry-test/route.ts` | Inspect implementation/delegated handler |
| `/api/teams/[id]/ppt-evaluate` | POST | `src/app/api/teams/[id]/ppt-evaluate/route.ts` | verifiedEvaluationActor |
| `/api/teams/[id]/ppt-evaluations` | GET, DELETE | `src/app/api/teams/[id]/ppt-evaluations/route.ts` | getUser |
| `/api/upload/presign` | POST | `src/app/api/upload/presign/route.ts` | requireAdmin, requireVerifiedProfile |
| `/api/upload` | POST | `src/app/api/upload/route.ts` | requireAdmin, requireVerifiedProfile |
| `/api/webhooks/discord` | POST | `src/app/api/webhooks/discord/route.ts` | Webhook |
| `/api/webhooks/email-open` | GET | `src/app/api/webhooks/email-open/route.ts` | Webhook |
| `/api/webhooks/notification` | POST | `src/app/api/webhooks/notification/route.ts` | Webhook |
| `/api/webhooks/resend` | POST | `src/app/api/webhooks/resend/route.ts` | Webhook |
| `/auth/callback` | GET | `src/app/auth/callback/route.ts` | Inspect implementation/delegated handler |
| `/partners/hustle-carnival/phase-2/[[...path]]` | GET | `src/app/partners/hustle-carnival/phase-2/[[...path]]/route.ts` | Inspect implementation/delegated handler |

## Middleware, server actions and integration boundaries

- `src/middleware.ts`: protected route matcher, cookie refresh, admin/expo role checks; partner organizer APIs with bearer auth delegate to handler authorization. Source inspected, no migration to proxy performed.
- No `use server` directive found in tracked src at inventory time; mutations are API handlers, client Supabase requests and SQL RPCs.
- Auth callback: exact trusted origin and safe return path; Google proof is feature-gated. Onboarding/guards/profile role and suspension are separate checks.
- `src/lib/admin/requireAdmin.ts`: bearer/cookie verification, protected role/ban projection, exact founder identity; privileged client created after authorization.
- `src/lib/partners/requirePartnerAccess.ts`, `organizer.ts`, `workspace.ts`: event-scoped organizer reads and operations; dedicated authorization/isolation SQL suites.
- `src/lib/hustle-phase2/`: standalone page/API handlers, Google session proof, delivery ledger and autodispatch; hard-off/release flags and isolated SQL tests.
- `src/lib/hackathons/`: provider transport, bounded discovery, source freshness/evidence, lifecycle and guarded RPC writer; tested by explicit offline qualification.
- `src/lib/evaluator/`, `src/lib/ppt/`, `src/lib/ai/geminiClient.ts`: admission, role/membership, quota reservation, deadlines, provenance and result persistence. Live providers not called.
- `src/lib/emailDispatch.ts`, `src/lib/admin/dailyReportClaim.ts`, `src/lib/hustle-phase2/delivery.ts`: acceptance/unknown outcomes, permanent scheduled claim and delivery orchestration. Provider delivery unverified.
- `src/lib/r2.ts`, `mediaValidation.ts`, `geminiModeration.ts`: storage/signature/moderation boundaries; STAB-003/004/005/006.

## CI and deployment

- Vercel serverless Next App Router. `vercel.json` schedules round-2-once, database-activity-report and auto-scrape-leads; none invoked.
- Workflow inventory:
  - `.github/workflows/aggregator-qualification.yml`
  - `.github/workflows/analytics-digest.yml`
  - `.github/workflows/daily-database-report.yml`
  - `.github/workflows/discovery-live-readonly-qualification.yml`
  - `.github/workflows/hackermate-aggregator.yml`
  - `.github/workflows/mission20-discovery-hotfix.yml`
  - `.github/workflows/organizer-prospect-preview.yml`
  - `.github/workflows/pr-validation.yml`
  - `.github/workflows/rack-portal-qualification.yml`

CI dispatch and deployment status were not verified by running production jobs. Native PostgreSQL fixtures use PG18 here; PG17.6 aggregator equivalence remains unverified.
