# Mission 05 — security remediation plan

Status: **APPROVED and implemented for offline review — production release remains BLOCKED.** The founder explicitly approved this exact manifest on 24 October 2026, satisfying AGENTS.md section 5. Original proposal sections below remain the approval record; the completion checkpoint records actual work and overrides their former pending-implementation wording. The final packaging review verified CLI 2.122.0 transaction ownership, removed the generated migration's top-level BEGIN/COMMIT only, and passed PostgreSQL 17 offline grammar and 377 affected tests. The exact twelve-file manifest remains unchanged. See the [packaging evidence and publication stop](../qa/evaluator-reliability/README.md#final-migration-packaging-review--24-october-2026): Vercel preview tracking is enabled, so a push can deploy automatically and was not attempted.

Reviewed 24 October 2026 (IST). Candidate: PR #60 `40023bf` → #61 `0861c28` → #62 `0f7863839faa59482ec2b1a2ae64f1dc68b5ef20`; baseline/production source `83a9fa3`. All three drafts remain unmerged. PR #58 and unrelated features are excluded.

## 1. Scope and decisions for approval

- Make creation and modification of evaluation records authoritative to existing server APIs using the existing service role. Authenticated administrators receive no direct database score-writing exception.
- Preserve existing SELECT privileges/policies, self-deletion policy and server-authorized deletion. Preserve historical data, team sharing and additive JSON metadata.
- Require a freshly verified, explicitly non-banned profile before authenticated evaluation admission or an Idea attachment write. Retain the existing Bearer-only evaluator identity boundary.
- Preserve anonymous Idea evaluation. A request with no identity cannot conclusively be associated with a suspended account; supplying invalid/suspended credentials must never downgrade to anonymous.
- Keep all admission/retention/provider/output safeguards and limits. Assume the added indexed profile lookup must fit within the existing five-second preflight and request deadlines; no caching, additional retries, provider calls or limit increases.
- Use one forward-only permission migration, no new tables, columns, functions, triggers, credentials, accounts, dependencies or infrastructure. Implementation, integration mutations, production application, merge and deployment require their respective explicit approvals.

Recommended approach: revoke client result-write privileges AND remove the corresponding write RLS policies, retaining service-role APIs. Keeping a browser `UPDATE(team_id)` exception was rejected: the existing policy checks ownership of the evaluation but not membership of the destination team; the authorized PATCH API already handles attachment. A new mutation RPC/trigger/provenance table is unnecessary for these two forward-looking blockers and would expand scope.

Suspension scope assumption: prevent new evaluation/admission/recovery and attachment writes. Existing authorized history reads and ownership/deletion/erasure behavior are preserved; this is not a universal ban across all product APIs. The check establishes admission-time status, not cancellation of already in-flight provider work or instantaneous session revocation.

## 2. Read-only deployed evidence and compatibility

Production project `rhryjrbebfrrfhtyyzbs`, PostgreSQL **17.6**, inspected using read-only transactions and catalogs only:

| Object | Verified state / consequence |
| --- | --- |
| Three base result tables | RLS enabled; owner postgres; anon/authenticated/service_role have table-level INSERT/UPDATE/DELETE and other grants. No inherited role memberships were returned for those roles. |
| Challenge policies | INSERT checks only `auth.uid() = user_id`; SELECT permits author, teammate, team owner or DB admin. No deployed UPDATE or DELETE policy. Do not silently install the historical DELETE policy. |
| PPT policies | INSERT/UPDATE allow member, owner or DB admin; INSERT does not constrain submitted_by. SELECT uses the same membership/owner/admin access. No deployed DELETE policy. |
| Idea policies | Self INSERT/UPDATE/DELETE, own SELECT, team member/owner SELECT. There is also a column UPDATE grant on team_id. |
| `team_ppt_evaluations_public` | Dependent view exists, security_invoker=true, broad ACL. It exposes base scores/status/provenance and a conditional ppt_url. Explicitly close its INSERT/UPDATE privilege as well; retain its SELECT behavior and definition. |
| Dependencies | PK/FKs only on the result tables; profile/user/team/challenge cascades or SET NULL actions remain unchanged. Only result-table trigger is PPT updated_at, assigning NOW(); preserve its CAS behavior. No non-SELECT rewrite rules, and no non-system function body matching these result relation names, were found. Version indexes are not unique; do not change serialization. |
| Protected suspension data | profiles.is_banned is nullable with default false; aggregate inspection found zero NULL ban/role values. Existing profile trigger preserves role/is_banned for non-admin user updates. No profiles grants, policies or trigger change is proposed. |
| PPT schema | track_id is absent. Retain the existing narrow 42703/PGRST204 compatibility path and JSON track metadata. Do not apply the older track migration or recreate/drop its view. |
| Challenge schema | weekly_challenges lacks additional_rules and problem_pdf_url. The candidate evaluator unconditionally selects additional_rules, so its legitimate Challenge flow would fail before evaluation. Include only the narrow compatibility adjustment below; no schema addition. |

The source inventory below was completed before any proposed migration file was written. Search covered the full candidate checkout, including source, scripts, QA, docs, hidden tracked configuration and migrations; dependency/build/generated scratch directories were excluded. Same-name storage buckets, fixtures and consumers were distinguished from database queries. Duplicate workspace checkouts are not alternate application versions for this candidate.

## 3. Proposed permission migration

After approval, generate **one** new migration with `supabase migration new mission05_evaluator_result_authority`; record its generated path under `supabase/migrations/<generated timestamp>_mission05_evaluator_result_authority.sql`. No filename or migration is generated in this planning task.

Exact permission delta proposed for that file (review notation, not an applied migration):

```sql
REVOKE INSERT, UPDATE, TRUNCATE, TRIGGER ON TABLE
  public.challenge_submissions,
  public.team_ppt_evaluations,
  public.user_pitch_evaluations
FROM PUBLIC, anon, authenticated;

REVOKE UPDATE (team_id) ON TABLE public.user_pitch_evaluations
FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE ON TABLE public.team_ppt_evaluations_public
FROM PUBLIC, anon, authenticated;
```

Remove only these INSERT/UPDATE policies, with IF EXISTS for known historical spelling variants:

- challenge_submissions: `Authenticated users can submit to challenges`.
- team_ppt_evaluations: `Allow team members to insert team_ppt_evaluations`, `Allow team members to update team_ppt_evaluations`, and the checked-in historical INSERT name `Allow team members to insert pitch evaluations`.
- user_pitch_evaluations: `Users can insert own pitch evaluations`, `Users can update own pitch evaluations`.

Retain RLS, every SELECT/DELETE policy and privilege, service-role rights/BYPASSRLS, IDs/defaults/FKs/indexes, view definition and timestamp trigger. No blanket REVOKE ALL, GRANT to a client role, global default-privilege change, CASCADE drop or row rewrite. TRUNCATE/TRIGGER are removed because neither is an application ownership/deletion operation and they could bypass or undermine the result boundary. REFERENCES/MAINTAIN are outside this permission change.

Execute the eventual migration atomically, with a short lock timeout and no background retries. Pre/post assertions must check actual owner/grantor, RLS, view invoker setting, effective table AND every-column privileges, role inheritance, expected policy set, and service-role access. Abort on unexpected drift (including ALL policies, another writer/view/RPC or unexpected column grant); do not dynamically drop unrelated objects or ignore a failed revoke. PostgreSQL 17 table revocation also revokes corresponding column privileges; the explicit team_id revoke documents the known exception, and effective-column assertions are the acceptance criterion. See [PostgreSQL REVOKE](https://www.postgresql.org/docs/17/sql-revoke.html) and [Supabase column privileges](https://supabase.com/docs/guides/database/postgres/column-level-security).

## 4. Proposed application changes

1. Extend `verifiedEvaluationActor` in `src/lib/evaluator/evaluationContract.ts`, retaining its string user-ID return contract. After getUser verifies the Bearer token, SELECT exactly `id, is_banned` from profiles for that UUID using existing service client, abort signal and remaining preflight deadline. Require one matching profile and literal `is_banned === false`. Banned/missing/malformed/unknown state returns forbidden (403); query/transport failure logs its actual allowlisted error code through console.error and fails unavailable (503); deadline/cancellation keeps the existing deadline outcome. Never trust request identity, JWT user_metadata or a cached UI flag.
2. In `src/app/api/evaluator/evaluate/route.ts`, replace the duplicated authenticated identity branch with that helper when an Authorization header is supplied. Only a genuinely absent header retains the anonymous path. Profile denial must precede reserveEvaluation, provider attempts and history INSERT; never retry anonymously. PPT and Challenge already call the helper before admission, so inherit the same gate without a PPT route edit. PPT's existing explicit DB-admin exception remains only for non-banned callers; Challenge still requires its existing team membership and does not gain an admin membership bypass. No founder/email exception is added.
3. In `src/app/api/evaluator/history/route.ts`, apply the same non-banned gate to PATCH before its service-role attachment write. Retain the existing author + destination member/owner checks and team_id-only payload. Check/log all relevant query errors before the write; do not turn lookup failures into not-found/success. GET/DELETE retain their current ownership semantics. All browser attachment calls already use this API.
4. In `src/app/api/challenges/[slug]/evaluate/route.ts`, add one bounded SELECT retry without additional_rules only for exact 42703/PGRST204 naming that optional column. Apply it consistently to the existing exact/canonical/UUID lookup chain within the same preflight budget. On a confirmed absent column, record no additional rules; never suppress permission, network, unknown-column or malformed rules errors. When rules exist, continue reading/enforcing them. No invented rules or fabricated format violations. No change to active-window, target, membership, ingestion, quotas, output validation or persistence safeguards.

## 5. Exact implementation manifest proposed

All paths are relative to this candidate checkout; only this Markdown plan is created now.

| File | Proposed future action |
| --- | --- |
| `supabase/migrations/<generated timestamp>_mission05_evaluator_result_authority.sql` | New permission-only migration and assertions described above; timestamp resolved by CLI after approval. |
| `src/lib/evaluator/evaluationContract.ts` | Shared non-banned profile gate. |
| `src/app/api/evaluator/evaluate/route.ts` | Reuse gate for supplied identity; preserve anonymous admission. |
| `src/app/api/evaluator/history/route.ts` | Gate/verify PATCH attachment, preserve GET/DELETE. |
| `src/app/api/challenges/[slug]/evaluate/route.ts` | Narrow optional-rules projection compatibility. |
| `scripts/test-evaluator-reliability.cjs` | Suspension/order/deadline/optional-column regressions using real handlers with mocked boundaries. |
| `scripts/fixtures/evaluator-benchmarks.cjs` | Explicit non-banned profile fixtures and controlled profile failures; preserve all 60 contracts. |
| `scripts/test-evaluator-result-authority.cjs` | New offline history attachment, read/delete and caller compatibility regressions. |
| `scripts/test-evaluator-result-authority-pg17.cjs` | New explicit opt-in existing-target permission/integration runner; no account creation, migration application or target provisioning. |
| `docs/qa/evaluator-reliability/README.md`, `docs/qa/evaluator-reliability/results.json` | Update only with observed remediation evidence after approved work, including blocked integration checks. |
| `docs/plans/2026-10-24-mission05-security-remediation.md` | This plan/inventory; approval and later evidence references. |

No frontend redesign, changes to result/history contents, extra trusted flag, original migration edits, cleanup changes, provider changes, dependency changes or new PR are proposed in this planning task. The strict migration filename is intentionally pending CLI generation, rather than fabricating a timestamp.

## 6. Test and verification contract

### Offline, after implementation approval

- All three evaluation handlers: banned, NULL/missing/mismatched profile, query error/throw, cancellation and slow lookup return scoreless failure with **zero** limiter calls, provider calls, initialization/recovery or result writes. Test banned admin too. Non-banned authorized owner/member/admin cases preserve exactly their existing rights; authenticated admin direct database writes have no exception.
- Idea: absent identity remains anonymous (same limits, no history); bad/empty/malformed/suspended supplied identity never becomes a guest. Assert the live protected profile lookup occurs before any side effect.
- Attachment: own evaluation + member/owner team succeeds through existing service API, changing team_id only; foreign evaluation/team, suspended caller and failed lookups fail closed. Caller-supplied scores/status/provenance do not enter the mutation. Read, delete, linked-card, prefill, membership joins, public leaderboard and admin-count consumers retain their projections/behavior.
- Challenge: existing/missing additional_rules branches, real rules retained, narrow missing-column retry only once, denied/unknown errors stop, no provider/admission bypass and shared deadline preserved. PPT missing-track fallback, CAS recovery and reconciliation continue to pass.
- Repeat the existing evaluator, presentation, retention, admin, authorization and email suites plus relevant my-teams/analytics checks. Run `npx tsc --noEmit` and `node scripts/smoke-test-core-pages.js`; manually verify affected runtime routes and the fixed core pages. Mocked SQL authorization is not proof that Postgres denies writes.

### Separately approval-gated PostgreSQL 17 / Supabase procedure

The runner must refuse production project `rhryjrbebfrrfhtyyzbs`, refuse non-17 servers or an unapproved target, use existing connections only, avoid printing credentials and avoid every Gemini/cleanup endpoint. Apply the reviewed migration separately only after permission to do so; the test runner must never apply it. Recheck catalog parity before testing. No accounts/infrastructure may be created.

1. In an existing approved non-production PostgreSQL 17 target, inspect effective privileges, RLS, policies, view and service role. Test real role contexts (`anon`, `authenticated`, service_role) with transaction-local synthetic claims, never privileged owner execution masquerading as a client test.
2. Run privilege-denial cases for full/default INSERT, INSERT...ON CONFLICT, each protected UPDATE including JSON provenance/score/status/grade/ownership, team_id-only UPDATE, mixed-column updates, TRUNCATE and view INSERT/UPDATE. Expect insufficient privilege, not an unrelated FK error or an empty successful result. Use fresh synthetic IDs only; savepoint/rollback every case. Catalog checks must confirm every column denies client INSERT/UPDATE. Use nonexecuting EXPLAIN for positive write planning when no FK-valid fixture is permitted, and label it **permission-only evidence**.
3. Full positive service-role persistence, PPT evaluating/completed/failed/CAS recovery, concurrency, history attachment and legitimate delete/read tests require dedicated disposable **FK-valid** identities/team/challenge and a usable existing Supabase authentication context. No such fixtures are authorized by this plan. The current **no-test-accounts** constraint prevents creating the identities needed for this stage; do not substitute real production IDs, disable FK/RLS/triggers or claim EXPLAIN/mocks prove persistence. This stage remains **BLOCKED** unless a separately approved fixture method within an existing environment is supplied. Do not create a test account to unblock it.
4. For any later authorized fixture insertion, enforce a fake-ID allowlist, dedicated entity ownership, outer `try...finally`, per-test savepoints and final ROLLBACK; REST tests that commit need exact-key cleanup in finally and verification that nothing remains. Cleanup failure blocks completion. No real production identity/team may be used for test insertions.
5. Verify PostgREST denial and normal browser → API → database flows with provider mocked locally and external egress denied, in an existing approved setup only. A SQL SET ROLE test alone does not prove JWT/PostgREST integration. If no safe fixture setup exists, report blocked rather than creating one.

Runtime coverage after any approved permission migration includes `/dashboard`, `/profile/[id]` (2–3 existing users for read-only checks), `/developers`, `/connections`, `/teams`, `/teams/[id]`, `/hackathons/sih`, plus `/evaluator`, Idea attach/history/delete, `/my-teams`, `/teams/[id]/workspace` PPT, Challenge history/detail/share/leaderboard and admin counts. Successful public reads are expected to remain unchanged: no SELECT privilege/policy is being reduced. Deletion tests run only on authorized disposable fixtures. There is no provider billing approval hidden in these checks.

## 7. Release ordering, risks and rollback

- Approval of this document authorizes neither production migration nor deployment. Keep #60/#61/#62 unmerged while implementing/reviewing the approved remediation on the pinned candidate. User runs all staging/commit/push commands; a later staging audit must list only approved files.
- Before any production change, repeat catalog/query inventory against the actual release head and verify the service role is configured; an environment depending on authenticated fallback for result creation will intentionally fail after hardening. Existing production-base Idea/PPT use service role, and Challenge prefers it; absence of that key is not a reason to restore client write grants.
- Release the migration only through a separately approved migration step. Recheck assertions and production read-only smoke/runtime behavior before enabling the candidate. Application release follows only once the authenticated profile gate and all Mission 05 gates have approved evidence. Do not merge a permission-file-only PR and assume the migration ran.
- ACL hardening is forward-looking. It cannot certify previously writable historical rows or make existing JSON provenance trustworthy retroactively. Do not backfill, delete, recalculate, sign or relabel old records in this fix; no incident/forgery occurrence is asserted. Stronger historical authenticity claims remain unsupported.
- Application rollback retains database hardening and should fail affected evaluation routes unavailable if needed. Do **not** roll back by restoring INSERT/UPDATE grants, team_id client updates or permissive write policies: that reintroduces forged results. Any replacement migration must preserve the boundary; no down-migration or old view/migration replay. Existing ownership deletion and FK cascades remain unchanged.
- These changes address the two security blockers plus the narrowly documented existing Challenge projection compatibility issue. They do not close cron/retention operating evidence, account erasure/key rotation, backlog capacity, real PostgreSQL/PostgREST integration, deployed proxy/ingress/clock or exact Gemini acceptance/quality gates from the release audit. No paid calls or new infrastructure are authorized.

## Appendix — query inventory required by AGENTS.md

No query on the three tables requests wildcard columns; the `teams` wildcard is on teams, and the nested PPT projection is explicit. The following projection aliases expand to exact columns to avoid repeating long strings. Filter/order columns are also recorded below. INSERT/UPDATE payloads name every written top-level column; AI JSON subfields remain inside the protected JSONB columns.

### Exact projection sets

- **C**: id, challenge_id, user_id, team_id, submission_mode, submission_type, external_link_url, ppt_url, file_name, github_url, demo_url, version, status, score_problem, score_solution, score_architecture, score_feasibility_impact, total_score, grade, strengths, growth_areas, slide_feedback, format_violations, score_deductions, ai_raw_feedback, used_ai_fallback, created_at, updated_at.
- **CL**: id, challenge_id, user_id, team_id, submission_mode, submission_type, file_name, version, status, score_problem, score_solution, score_architecture, score_feasibility_impact, total_score, grade, strengths, growth_areas, slide_feedback, format_violations, score_deductions, ai_raw_feedback, used_ai_fallback, created_at, updated_at.
- **P**: id, team_id, submitted_by, ps_title, ps_category, submission_type, external_link_url, ppt_url, file_name, version, status, score_novelty, score_tech, score_ui_ux, score_team, total_score, grade, slide_breakdown, ai_feedback, error_message, created_at, updated_at.
- **PL**: id, team_id, ps_title, ps_category, submission_type, external_link_url, file_name, version, status, score_novelty, score_tech, score_ui_ux, score_team, score_impact, score_plan, score_clarity, total_score, grade, slide_breakdown, ai_feedback, error_message, created_at, updated_at. Initial list adds optional track_id; fallback uses PL exactly.
- **I**: id, user_id, ps_title, track_id, total_score, grade, used_ai_engine, sub_scores, evaluation_result, created_at.
- **IL**: id, ps_title, track_id, total_score, grade, used_ai_engine, sub_scores, evaluation_result, created_at.

### challenge_submissions — all application queries

| File | Exact operations / columns / scope |
| --- | --- |
| `src/app/api/challenges/[slug]/evaluate/route.ts` | SELECT id,status filtered by user_id,challenge_id,created_at; SELECT version filtered by challenge_id and team_id or user_id, ordered version. INSERT id,challenge_id,user_id,team_id,submission_mode,submission_type,external_link_url,ppt_url,file_name,github_url,demo_url,version,status,score_problem,score_solution,score_architecture,score_feasibility_impact,total_score,grade,strengths,growth_areas,slide_feedback,format_violations,score_deductions,used_ai_fallback,ai_raw_feedback; RETURN C. Reconciliation SELECT C by id,user_id,challenge_id. Service role only. |
| `src/app/api/challenges/[slug]/submissions/route.ts` | SELECT CL by challenge_id and own user_id or member team_id, ordered version; service preferred, JWT fallback. No writes. |
| `src/app/api/challenges/[slug]/submissions/[id]/route.ts` | GET SELECT C by id, author/member/admin access; DELETE preflight SELECT id,challenge_id,user_id,team_id,ppt_url by id then DELETE by id after author/team-owner/admin authorization. No return projection on DELETE. Service preferred/JWT fallback. Storage remove is a separate bucket operation. |
| `src/app/api/challenges/leaderboard/route.ts` | SELECT id,challenge_id,user_id,team_id,submission_mode,total_score,grade,score_problem,score_solution,score_architecture,score_feasibility_impact,version,created_at; embeds weekly_challenges(title,challenge_number,slug), profiles(id,full_name,avatar_url,username), teams(id,name). Filters status=completed,total_score>0, optional challenge_id/submission_mode; orders total_score,score_architecture,created_at. Public server-curated read; service preferred. |
| `src/app/api/admin/challenges/route.ts` | SELECT challenge_id,id for counts under requireAdmin (verified non-banned profile). Admin challenge deletion in `[id]/route.ts` deletes weekly_challenges and reaches submissions only through its existing CASCADE FK. |
| `src/app/profile/[id]/useProfileData.ts` | Browser SELECT id, head/exact count, by user_id. Existing RLS controls visibility. |

### team_ppt_evaluations — all application queries

| File | Exact operations / columns / scope |
| --- | --- |
| `src/app/api/teams/[id]/ppt-evaluate/route.ts` | SELECT id,updated_at by team_id,status=evaluating, ordered updated_at; recovery UPDATE status,error_message,updated_at with id/team_id/status/updated_at/cutoff CAS RETURN id; active recheck SELECT id; rolling SELECT id by team_id,created_at; version SELECT version by team_id ordered version. INSERT id,team_id,submitted_by,ps_title,ps_category,submission_type,external_link_url,ppt_url,file_name,version,status,ai_feedback plus optional track_id, RETURN id; narrow missing-track retry omits track_id. Completion UPDATE status,score_novelty,score_tech,score_ui_ux,score_team,total_score,grade,slide_breakdown,error_message,updated_at,ai_feedback by id/team_id/status RETURN P. Reconcile SELECT P by id/team_id. Failure UPDATE status,error_message,updated_at by id/team_id/status RETURN id. Service-role owner/member/DB-admin authorization. |
| `src/app/api/teams/[id]/ppt-evaluations/route.ts` | SELECT PL+track_id, retry PL, by team_id ordered version. DELETE by id,team_id with no RETURN projection. Service role; member/owner/DB-admin authorization. |
| `src/app/teams/useTeamsData.ts` | Browser teams SELECT `*, team_members(id), hackathons!teams_hackathon_id_fkey(id,name,end_date,status,archived), team_hackathons(hackathons(id,name,end_date,status,archived)), team_ppt_evaluations(total_score,grade,status)` ordered teams.created_at. Nested RLS applies; anonymous visitors must retain the existing successful query/empty-private-relation behavior. |
| `src/app/my-teams/useMyTeamsData.ts` | Browser team_members SELECT `user_id, teams(id,name,description,owner_id,team_ppt_evaluations(id,total_score,grade,status,version))`, scoped to verified member user_id. |
| `src/lib/admin/analyticsSummary.ts` | Dynamic table dispatch includes team_ppt_evaluations: SELECT id with exact count/head, created_at<=until and optional created_at>=since; existing service-role analytics/admin consumers and PDF. No writes. |

### user_pitch_evaluations — all application queries

| File | Exact operations / columns / scope |
| --- | --- |
| `src/app/api/evaluator/evaluate/route.ts` | Service INSERT user_id,ps_title,track_id,total_score,grade,used_ai_engine,sub_scores,evaluation_result RETURN id; only verified identity, never anonymous history. |
| `src/app/api/evaluator/history/route.ts` | GET SELECT I by user_id ordered created_at. DELETE by id,user_id with no RETURN projection. PATCH preflight SELECT id,user_id,ps_title by id, then UPDATE team_id by id,user_id RETURN id,ps_title; also reads team_members(id) by user/team and teams(id,name,owner_id) by team. Existing service role. |
| `src/app/teams/create/page.tsx` | Browser SELECT id,ps_title,evaluation_result by opaque id for prefill only. It does not update/attach the result table. |
| `src/components/LinkedIdeaScorecard.tsx` | Browser SELECT IL by team_id ordered created_at; author/team RLS governs read. No writes. |

### Non-query consumers, scripts and schema references reviewed

- `src/components/PitchEvaluatorClient.tsx`: POST Idea, GET/DELETE history, PATCH attachment, local WhatsApp text sharing and team prefill. `src/components/PPTEvaluatorTab.tsx`: POST evaluate, GET/DELETE list, compare/display and default-deny team controls. `src/app/challenges/[slug]/page.tsx` and `src/app/challenges/[slug]/submissions/[submissionId]/page.tsx`: POST/list/detail/delete and metadata-based share eligibility. `src/components/challenges/ChallengeLeaderboard.tsx`: public leaderboard API. `src/app/admin/page.tsx`: admin Challenge API and storage bucket only. `src/app/teams/TeamsView.tsx` and `src/lib/challenges/streakHelper.ts`: consume already-fetched values, no result-table query. `src/app/dev/v2/teams/page.tsx`: static fixture.
- `scripts/smoke-test-core-pages.js`: actual read SELECT id,status,created_at from team_ppt_evaluations, limit 1. No INSERT/UPDATE/DELETE/mutating RPC. Its real-user IDs are read-only, not insertion fixtures.
- `scripts/test-evaluator-reliability.cjs` and `scripts/fixtures/evaluator-benchmarks.cjs`: mocks of the real handlers above; no additional production query. Idea mock expects INSERT RETURN id; presentation adapter records the exact select/payload/filter sets above.
- `scripts/test-analytics-summary.cjs`: mocked SELECT id head/exact count, created_at bounds, matching analyticsSummary. `scripts/test-my-teams-applications.cjs` / `scripts/test-my-teams-applications-browser.cjs`: synthetic nested membership rows matching the listed my-teams projection. `scripts/test-hustle-phase2-browser.cjs` / `scripts/rehearse-hustle-csv-launch.cjs`: local stub returns [] for team_ppt_evaluations; no connected DB query. `scripts/regression-ppt-evaluate-fallback.js`: error strings only. No unrelated fixture files are proposed for modification.
- Original table/RLS/view/grant definitions: `supabase/migrations/20260813190000_team_ppt_evaluations.sql`, `20260814205000_add_ui_ux_team_columns_to_ppt_evaluations.sql`, `202608160001_weekly_practice_challenges.sql`, `202608160002_fix_challenges_rls_and_admin.sql`, `20260904210000_create_user_pitch_evaluations.sql`, `20260905200000_add_team_id_to_user_pitch_evaluations.sql`, `20260905210000_add_track_id_to_team_ppt_evaluations.sql`, `20260917183500_delete_challenge_submission_policy.sql`. Do not edit or replay them. The current view projects id,team_id,submitted_by,ps_title,ps_category,file_name,submission_type,external_link_url,version,status,score_novelty,score_tech,score_impact,score_plan,score_clarity,total_score,grade,slide_breakdown,ai_feedback,error_message,created_at,updated_at and a membership-dependent ppt_url; no application query targets the view directly.
- Historical prose references: `docs/plans/2026-10-19-pending-applications.md`, `docs/plans/2026-10-23-evaluator-reliability-quality.md`; no executable query. Generic migration/grant searches revealed no additional source mutation path for these tables. Catalog findings take precedence over historical policy names/intent.

**Implementation approval checkpoint satisfied.** Production writes, migration application, integration mutations, deployment, merge, paid calls and any change to the no-test-accounts constraint remain separately unauthorized.

## Implementation checkpoint — 24 October 2026

Implemented exactly the twelve approved files, including this formerly untracked approved plan. Supabase CLI **2.122.0** generated `supabase/migrations/20261024030634_mission05_evaluator_result_authority.sql` using `migration new mission05_evaluator_result_authority`. Telemetry was disabled for the local command; no credentials/configuration, remote permission or database was created/changed. The migration has **not** been applied or executed against any database, including local PostgreSQL.

The shared gate requires the live protected profile's literal false ban state. Idea and attachment reuse it; existing PPT/Challenge calls inherit it. Transport aborts and late Auth/profile replies preserve the deadline outcome. Attachment forwards only team_id after verified ownership/team checks; GET/DELETE behavior is preserved. The optional Challenge rules projection retries only the recognized missing-column error, while real rules remain intact. No other evaluator/retention/admission/output safeguards changed.

Final observed evidence: **850/850** full-suite tests, then **354/354** final evaluator cases including four additional malformed-credential regressions: **854 distinct tests**, not 1,204 (the overlapping evaluator cases are counted once). The authority suite contributes **22** cases. All **60** mock benchmark contracts executed: 45 controlled valid responses accepted and 15 invalid evidence responses rejected. Post-final-build standalone TypeScript and scoped ESLint passed (zero lint errors/warnings). Safe synthetic production build passed **44 HTML checks / 39 anonymous fixture reads**, with no writes/external data. The existing smoke script passed all **8** checks through **10** read-only synthetic loopback requests. This is offline fixture evidence, not deployed permission/provider attestation.

Two read-only review findings (runner catalog preflight and signal-aware deadline classification) were corrected and regression-tested; Standards and Spec reviewers reported zero remaining actionable findings. Migration syntax/effect has not been verified by executing PostgreSQL 17. The opt-in runner refuses production or absent approval before connecting; its read-only catalog/EXPLAIN phase is implemented but **not run against a connected target**. Actual PostgreSQL 17 result enforcement, service-role persistence/CAS/concurrency, real PostgREST/JWT and authenticated browser flows remain blocked by separate integration approval and the no-test-accounts/fixture constraint. No substitute PostgreSQL 18 result is claimed.

Only approved files remain modified/untracked; generated build logs/fonts/results were moved into ignored scratch artifacts. No staged changes, commit, push, PR creation, merge, deployment, SQL application, provider call, account or infrastructure creation occurred. PR #58 and all three existing drafts are unchanged remotely. Follow the release order and forward-only rollback protections in section 7; every original operational release gate remains in force.
