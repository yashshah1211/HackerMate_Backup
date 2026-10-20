# Round 2 activation preparation — NO-GO for release

**Account-onboarding update:** source constant `ACCOUNT_ONBOARDING_RELEASE_APPROVED=false` now additionally blocks Production/Preview. Environment switches alone cannot enable this candidate. Follow `hustle-round2-participant-accounts.md`; historical flags-only activation instructions below are superseded.

Base: `8f9b9cfcafd01c09202b518ea29e19e2b3ec0a38`. Registration window: **October 23, 2026, 10:00 AM inclusive–11:00 PM exclusive IST** (04:30–17:30 UTC), enforced by database time. This is a local review candidate, not approval to publish, deploy, migrate, activate or send. ₹0; no dependencies added. PR #28 is excluded. The completed organizer handoff is not repeated here.

## Exact code/configuration contract

Only application change: `src/lib/hustle-phase2/server.ts::enabled()`. The former source constant `PRODUCTION_RELEASE_APPROVED=false` becomes a per-request check of a NEW server-only approval variable. This deliberately moves the second approval from a future source edit into restricted production configuration; review that change in authority explicitly. Repository code and a production deployment must first be approved independently. No source flip is then needed at launch.

| Setting | Disabled candidate | Required for a separately authorized release |
| --- | --- | --- |
| `HUSTLE_PHASE2_RELEASE_APPROVED` | unset or `false` | exact `true`, recorded approval by the release approver |
| `HUSTLE_PHASE2_ENABLED` | unset or `false` | exact `true`, controlled by the incident/release operator |
| `NODE_ENV` | platform-managed | `production` |
| `VERCEL_ENV` | platform-managed | `production`; Preview/development denied |
| `HUSTLE_PHASE2_LOCAL_FIXTURE` | unset | unset or `false`; exact `true` blocks production |
| `NEXT_PUBLIC_SUPABASE_URL` | existing approved project setting | exact HTTPS project root `https://rhryjrbebfrrfhtyyzbs.supabase.co`, no credentials, nondefault port, path, query or fragment |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | existing configuration | nonblank matching public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only configuration | nonblank matching service key; never `NEXT_PUBLIC_*` |

Secret key values must not be printed or committed. The production gate pins the hostname to HackerMate project ref `rhryjrbebfrrfhtyyzbs`; this does not prove key validity, project/key pairing, permissions or migration readiness: the release owner must verify those privately against Desktop’s signed-off target. Current production uses hosted Supabase; a future custom domain would require a reviewed gate adjustment. `NEXT_PUBLIC_SITE_URL`, HTTPS production host and Auth callback allowlist must also match the approved site as existing operational prerequisites, although this gate does not validate them.

`NEXT_PUBLIC_SUPABASE_URL` and the public anon key are Next build-time inputs: a restart with different runtime values is not a reliable configuration change. Build/deploy the approved SHA with the reviewed matching values.

Switches are exact, case-sensitive strings. Both default OFF and are read on every request. No new framework, dashboard control or data API is introduced. Local fixtures still require explicit `NODE_ENV=test/development`, enablement, the local-fixture flag and HTTP loopback; any hosted `VERCEL_ENV` blocks this bypass. Do not set either production switch in Development/Preview or project-wide shared scopes. Limit access to production environment configuration; these two variables are two conditions, not an enforced two-person approval system.

The original `hustlePublicParticipationEnabled(): false` and portal remain unchanged. Round 2 does not create ordinary hackathon registrations/teams or enable discovery. Its only leader decision path requires a valid invitation capability and the active official shortlist; no signup or public enrollment endpoint is added. The portal guard is a presentation guard, not a new database access policy. Existing generic HackerMate participation/RLS remains outside this patch and must not be treated as Round 2 eligibility.

## Affected-route security review

Both route wrappers are Node, `force-dynamic`. The shared gate runs first in **both** handlers, before request-body parsing, auth, SDK client construction and database calls. Middleware does not intercept the nested Round 2 paths; their handlers perform authorization themselves.

| Route/action | Enabled security boundary and data | Disabled behavior |
| --- | --- | --- |
| GET `/phase-2` | HttpOnly invitation cookie hash inspection; only team/leader/optional member/decision/window, no email/phone. No valid cookie: invitation-only information. | Unavailable HTML, 200, no SDK calls |
| GET `/phase-2/invite` | Generic landing HTML, token only in browser fragment/memory; fragment stripped before explicit same-origin exchange. No token inspection or mutation on GET. | Unavailable HTML; no exchange script |
| GET `/phase-2/organizer` | Verified non-banned profile + exact-event caller-JWT access, then authorized snapshot. Admin controls only for protected admin/founder identity. | Unavailable HTML, no auth/DB |
| GET API `organizer`, `export` | Same verified exact-event authorization; caller-JWT snapshot. Export private, CSV escaped/formula-neutralized. No invitation hashes/tokens. | Generic JSON 503, no auth/DB |
| POST API `columns`, `import` | Verified admin, same-origin, bounded body, explicit columns; commit bound to actor/file/mapping/expiring dry-run receipt; no silent overwrite. | Generic JSON 503, no body/auth/DB |
| POST API `activate` | Same admin/CSRF boundary; exact batch UUID/digest + explicit `ACTIVATE`; database rechecks authority and readiness. | Same 503 |
| POST API `invite`, `revoke` | Same admin/CSRF boundary, UUID only. New 256-bit token returned once in fragment URL, only hash to RPC. Snapshot recipient verification remains intact; no delivery added. | Same 503 |
| POST API `session` | Public but requires valid bearer, same-origin, bounded form, rate limit; inspect hash then clean 303 with HttpOnly/Secure-on-HTTPS/Strict cookie, lifetime at most 20 minutes/cutoff. | Same 503, no cookie exchange |
| POST API `respond` | Same-origin, cookie bearer hash, exact decision, public/token limits. DB active-batch, expiry/revocation/window/row-lock/one-response enforcement unchanged. | Same 503 even for a previously opened form/cookie |
| Unknown action/path | Private generic error, never arbitrary RPC dispatch. Query parameters on API rejected. Unsupported methods are framework 405/OPTIONS and contain no roster. | Exported GET/POST handlers gate first; unknowns also unavailable |

Handler responses (success, errors, redirect, export, disabled HTML/JSON) retain `private, no-store, max-age=0`, no-referrer, noindex, nosniff and frame denial. HTML also retains nonce CSP with self-only form/connect and no third-party scripts. No CDN cache opt-in. Framework-generated unsupported-method responses do not use the handler's private headers, but contain no participant data. Auth cookie rotations remain preserved. Only authorized snapshots expose contacts; recipient templates retain HTML escaping and use no separate participant API.

Raw bearers are not logged/persisted by this patch or passed to DB RPCs. The existing intentional bearer stores are the transient browser/link display and HttpOnly session cookie; the cookie is necessary for access. Request/cookie/body capture, support screenshots, replay and deployment/platform logging still require the existing privacy review; code inspection is not evidence of external logging configuration. Existing RPC errors omit detail/hint; operational alerts must remain metadata-only. Browser tests use random synthetic tokens and never write them to evidence files.

Possession permits access: links are **not identity-bound**. A completed response cannot currently be corrected through the supported interface. Revocation does not undo a recorded decision. The shared gate also shuts off organizer reporting/import/invite/revoke, not only participant responses.

## Remaining release gates — all mandatory

- [ ] Independent approval of the exact preparation diff/SHA and the change from source approval to restricted environment approval; permission to publish/deploy is still absent.
- [ ] Desktop’s real Supabase Auth/PostgREST integration and production database-readiness sign-off for the final candidate: identity/rotation, event scoping, RPC grants/RLS, schema visibility, active/inactive/invalid invitations, concurrency and cutoff. This work neither runs nor changes those integration fixtures.
- [ ] Separately approved migration owner, target, ledger procedure, canonical checksum and successful postflight; record either verified backup/restore evidence OR an explicitly authorized, documented no-backup exception limited to applying the disabled additive migration. Migration remains `20261018082156_hustle_phase2_shortlist.sql`, canonical Git SHA256 `4fc87a833b6e3c4687cba372a05717383cb8f35fdd60f03a7f90e166038f45e7`. No full-directory push or PR #28 schema.
- [ ] Privately verified production project/key pairing, production-only switch scopes, HTTPS/callback configuration, safe log/telemetry handling, eligible admin/event-organizer accounts and tested access. No accounts are provisioned here.
- [ ] Approved official team-wise shortlist/digest, designated leaders, independently checked destinations, staffed two-person recipient verification, delivery/support/cutoff owners and explicit outreach approval from the completed handoff. Workshop assets/date discrepancy remain organizer dependencies; do not alter that public page in this release.
- [ ] Release owner records the exact final artifact, code/lock hashes, approved operations and **verified production hard-OFF deployment ID**, plus who can roll back and observed rollback time. SHA `8f9b9cf` is source evidence, not proof of a retained/redeployable Vercel artifact.
- [ ] Separate release authorization and controlled smoke plan. No synthetic teams in the real one-shot shortlist; use Desktop’s synthetic target for rehearsal. Any legitimate production smoke record/invitation requires its own explicit operational approval.

A no-backup exception must identify the approving authority, operator, exact target, migration version/checksum, risk acceptance and why proceeding without a verified backup/restore is accepted. Keep both release flags OFF; it covers only the disabled additive migration, not real imports, invitations or response writes. It **does not establish recoverability or authorize activation**. Record the exception privately with the release evidence, not in participant data or secret-bearing logs. Activation still requires a separate recovery-risk review and explicit release approval; the migration-only exception must not be carried forward as activation authorization. No such exception is granted by this checklist.

## Controlled activation sequence — for the authorized release operator only

1. Freeze/review the final candidate incorporating any integration findings. Rerun gate tests and disabled production smoke on that exact SHA. Exclude PR #28; do not infer authorization from a green test run.
2. After separate publication/deployment approval, land/deploy this candidate with **both switches OFF**. Confirm exact deployment SHA, private unavailable Round 2 pages/API 503 and healthy existing portal/workshops. Record the retained source-hard-OFF production artifact as rollback; verify operator access to it. No activation as a side effect of merging this patch.
3. Database operator completes only the separately approved migration/preflight/postflight, accounts/access and ledger gates, with verified backup/restore evidence or the documented disabled-migration-only exception above. Desktop provides integration evidence; do not repeat or improvise it here. Keep switches OFF.
4. Release approver records signed-off gates and sets `HUSTLE_PHASE2_RELEASE_APPROVED=true` in **Production only**, leaving enablement OFF. Deploy/redeploy deliberately, verify still disabled; record artifact/config scope without secrets. This is a distinct approval condition.
5. After final launch authorization, operator sets `HUSTLE_PHASE2_ENABLED=true`, leaves local fixture unset/false and deploys the **same approved code SHA** with reviewed production configuration. Neither environment edit is a live hot switch. Record the new deployment ID and READY status before testing.
6. Controlled authorized smoke: correct identity boundaries, private headers/cookies/fragment removal, exact-event dashboard; before a real list is active, no leader can register. Admin validates/imports the approved inactive shortlist, independently verifies count/digest/recipients, then separately activates that batch. Only then issue/deliver individual invitations under the existing handoff. Activation does not bypass the time window. Do not add a public registration link or enable ordinary participation.
7. Observe safe aggregate errors/429s/decisions and recipient incidents throughout October 23, 10:00–23:00 IST. Stop on failed auth boundaries, leakage/misdelivery, unexplained writes/counts, wrong project/configuration or inability to roll back. At cutoff database responses close; disable through the approved deployment procedure afterward.

## Emergency hard-OFF / rollback

1. Stop invitation issuance/distribution immediately; notify the named incident operator through the already approved human process. This preparation sends nothing.
2. **Fastest prepared code stop:** use approved Vercel rollback controls to the recorded, verified, source-hard-OFF production artifact (the existing `8f9b9cf` code is hard-OFF regardless of the new switches). Confirm its exact deployment ID/SHA. Do not assume an old environment-only-OFF artifact remains OFF if rebuilt with different variables.
3. Also set `HUSTLE_PHASE2_ENABLED=false` and `HUSTLE_PHASE2_RELEASE_APPROVED=false` in Production to prevent accidental reactivation. An environment change requires a new deployment and does not mutate running functions; if rollback is unavailable, redeploy the reviewed hard-OFF source/configuration through the authorized incident procedure.
4. Probe all private page shapes and API actions: unavailable HTML/JSON 503, no new Round 2 database work; portal/workshops remain healthy. Already rendered pages may retain old data, but every subsequent exchange/response/admin call is gated. Reloading removes those controls. No application flag can recall a bearer already shared or erase someone’s browser memory/history.
5. In-flight requests may finish. Reconcile legitimate decisions with the authorized operator; retain schema, shortlist and audit. No global database kill switch exists. If immediate DB-level denial is necessary, escalate for a separately approved scoped incident action; do not improvise SQL or shared credential revocation. Do not drop tables, reset responses or restore over valid responses.
6. Resume only after diagnosis, renewed integration/security evidence and fresh release approval. Misdelivered pending links need approved revoke/reissue when service resumes; no automatic resend and no supported response correction.

## Verification scope and outcome

Verified locally on this preparation candidate:

| Check | Result |
| --- | --- |
| Clean `npm ci --cache /workspace/work/npm-cache --no-audit --no-fund` | 675 packages installed; manifests/lockfile unchanged |
| `npm run typecheck` | PASS; production build also typechecked |
| Scoped ESLint: `src/lib/hustle-phase2/server.ts scripts/test-hustle-phase2-release.cjs` | PASS |
| `node scripts/test-hustle-phase2-release.cjs` | 18/18; includes loopback Chromium at 390px/1440px, no external requests permitted |
| Existing `test-hustle-phase2.cjs` | 22/22 |
| Existing `test-hustle-carnival.cjs` / `test-hustle-carnival-workshops.cjs` | 19/19 + 7/7 |
| Existing `test-partner-authorization.cjs` / `test-team-creation.cjs` | 50/50 + 13/13 |
| `node scripts/test-hustle-phase2-production.cjs` | Optimized production build PASS; 8/8 actual Next HTTP checks; zero Round 2 requests to the fake DB |
| `git diff --check` and protected-path comparison to base | PASS; SQL, dependency files, existing Phase 2 tests and public participation guard unchanged |

Total: 129 passing offline tests (including the browser test) plus 8 production HTTP checks. Build uses the existing offline font fixture and fake loopback credentials, not a production deployment. Baseline middleware-to-proxy deprecation warning remains; no compatibility fix is required. The unrelated existing SQL privacy runner was attempted in the broader regression command but could not start (`initdb ENOENT`); no SQL ran and no database was created. It was not retried, and Desktop’s real integration/database work was not run or modified.

The new `scripts/test-hustle-phase2-release.cjs` runs actual TypeScript handlers/shared auth helpers with intercepted SDK factories and a loopback browser server. Enabled-mode assertions are **synthetic**, not proof of real Supabase/Auth integration. It checks every API action disabled before any SDK call, both switches/configuration, Preview denial, auth/CSRF/receipt/token boundaries, current-handler shutdown, original portal guard and mobile/desktop open-form shutdown. Existing production-disabled script builds/runs the actual Next app with fake loopback credentials and no release approval; it is not a live production probe. Its historical `featureGuardsUnchanged` evidence field describes retained hard-OFF behavior, not byte-identical gate source.

**GO for independent local review only. NO-GO for activation until every gate above is signed off.** No production environment was changed, no connected database was contacted, no migration or invitation was performed and no branch was pushed/Preview created by this preparation.
