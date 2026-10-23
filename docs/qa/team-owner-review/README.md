# Mission 02 — Stage A client correctness

Base: verified `main` at `51af1f0d2ed8faa0fed7fb28e699f230496a98be`. Branch: `fix/team-outcome-client-correctness`. No database, authentication, RLS, production configuration or PR #55 changes.

## Behavior

- The dedicated owner review page confirms the expected team ID from acceptance and exactly one pending request ID from rejection. Rejection is scoped by request, team and pending status.
- Capacity errors remain unknown and disable acceptance. They never appear as zero members. Decline remains available.
- A synchronous lock prevents competing row actions. Identity/route generations and effect cleanup suppress stale responses. Auth callbacks defer reads outside the callback.
- Leave, removal and disband require exactly one returned intended ID before success or navigation. Membership deletes include the team ID. Existing RLS remains authoritative. Stale confirmations and uncertain responses cannot cause automatic replay.
- Request submission requires its documented UUID result. Analytics exceptions are logged separately after confirmed business success.

## Verification

- `node --test scripts/test-team-owner-review.cjs scripts/test-team-request-lifecycle.cjs scripts/test-first-team-request-analytics.cjs scripts/test-dashboard-join-requests.cjs scripts/test-my-teams-applications.cjs scripts/test-invite-handoff.cjs scripts/test-team-creation.cjs`: **164 passed**, no failures. See `tests.txt`.
- `npx tsc --noEmit`: passed.
- Scoped ESLint on both changed pages and all four changed/new test scripts: passed.
- `node scripts/test-team-owner-review-browser.cjs`: **8 grouped viewport checks passed**, covering both actual request page and actual dashboard hook/view, eight before/after screenshots, zero external requests. All data and writes are synthetic. See `browser-results.json`.
- `node scripts/test-public-hackathon-metadata-production.cjs`: actual production build passed; **44 runtime HTML checks**, 39 anonymous loopback fixture reads, zero writes/external data. Existing Next middleware/Sentry/Supabase Edge warnings remain.

Screenshot pairs: [320 before](before-320.png) / [after](after-320.png); [390 before](before-390.png) / [after](after-390.png); [768 before](before-768.png) / [after](after-768.png); [1440 before](before-1440.png) / [after](after-1440.png). Before uses the exact base source and reproduces enabled acceptance after a failed capacity read and a false successful zero-row decline. After shows unknown capacity with acceptance unavailable. Screenshots inspected for narrow layout and overflow.

Browser adapters replace Supabase, AuthGuard, notifications, matching and Next navigation with synthetic implementations. Existing unrelated dashboard decorations are omitted. These tests exercise real React handlers/components/CSS, not live OAuth, middleware or database permissions. No production/staging mutation tests ran; Stage A changes no SQL. The permission-migration core-page smoke requirement applies to Stage B. No live release verification or deployment was performed.

## Risks and release prerequisites

Returning IDs relies on the existing SELECT visibility for affected requests/members/teams; insufficient permission yields an unconfirmed-change error, never success. A lost network response can follow a committed operation: the user sees uncertainty and refreshes; the client never infers rejection from disappearance. Existing server RPC locks, capacity rules, notifications and token behavior are unchanged.

Stage A improves client truthfulness; durable outcome measurement remains Stage B. No merge or deployment is approved. Rollback is to revert this source-only change; no database rollback is needed. Validate the same owner/member flows in an approved isolated deployment before production release.
