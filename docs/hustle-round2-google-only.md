# Round 2 Google-only candidate — disabled, unapplied, unpublished

Base: production main `64e72795200e9eb9c2df1e91939a1c1ef381c5a8`, fetched October 20.
Local branch: `fix/hustle-round2-google-only`. No test Preview bypass is included.

## Scope and reason

Supabase's OAuth AMR does not identify Google versus GitHub. Account-level
`app_metadata.provider`, a linked Google identity, or client metadata cannot
establish the provider used for the current session. Checking those alone would
permit ambiguous linked-account sessions.

The existing server PKCE callback, only for the exact Round 2 return path and
only when the existing release gate allows it, verifies the **provider access
token returned directly by the exchange** using Google's fixed HTTPS userinfo
endpoint. It requires a verified matching email and matching Google subject in
the Auth-returned identity, plus verified JWT subject/session/role. Client-supplied
tokens, provider selectors, and attestation requests are not accepted anywhere.
Verification failure, missing credential, timeout or missing identity denies.

Only then does the trusted server register a session/user proof. No Google access
or refresh token, contact details, invitation token or userinfo response is saved
in that table or logged. The userinfo request uses an Authorization header,
no URL credential, no cache, no redirect and a five-second timeout. This is the
existing Google OAuth service, with no new package or paid service.

Server participant authorization AND the database participant-identity helper
require this proof. The latter protects direct claim/view/inspect/respond RPCs.
It is session-specific: another session of the same linked account cannot reuse
it. Auth revocation/expiry, bans, onboarding, unique email, official roster and
leader/member restrictions remain enforced. Google proof grants no eligibility.

Ordinary HackerMate login, GitHub elsewhere, organizer/admin authentication,
profile grants, RLS, signup triggers and `is_admin()` are unchanged. Both source
and environment release gates and ordinary participation remain OFF. HARD-OFF
skips the new proof write/Google request in the callback, and private routes
still return before creating a database client.

## Proposed database change (not installed)

`supabase/migrations/20261020201500_hustle_google_sessions.sql`

Exact local file SHA256: `14f26db5bccb7cb6f4cb189590d311cf27607104a22286ee4b5bba93b92d27ae`.

- New RLS-protected `hustle_phase2_google_sessions`: session UUID, user UUID,
  verified time, expiry only. All raw privileges revoked from browser/service roles.
- New `hustle_phase2_attest_google_session(uuid,uuid)`: service-role-only EXECUTE;
  trusted locked-path definer, verifies matching active Auth session and unbanned,
  verified, non-anonymous account. It does not require onboarding before the normal
  onboarding screen. Duplicate calls cannot extend the proof's 24-hour lifetime.
- New boolean `hustle_phase2_google_session()`: authenticated-only EXECUTE,
  locked-path trusted definer. Requires existing active-session guard and proof
  matching the trusted JWT subject/session. Exposes no private session rows.
- Replace body of `hustle_phase2_participant_identity()`; same signature/owner/ACL,
  same account/onboarding/email checks, with the additional Google-proof guard.

Expected after separately approved installation: **7 Phase 2 tables, 17 functions**.
Historical migrations are unchanged and must not be replayed. New migration's
BEGIN/COMMIT must be handled correctly by any separately reviewed atomic ledger
envelope; this file does not claim to provide a production execution envelope.
Require trusted postgres ownership and existing narrow Auth SELECT privileges;
no new Auth schema privileges, Auth FKs or global policies are proposed.

New-table query inventory before writing its grants: registration helper inserts
`session_id,user_id`, checks `session_id,user_id,expires_at`; boolean helper reads
`session_id,user_id,expires_at`. No application raw-table query exists. No existing
table's privileges/RLS are changed. Expired proof rows retain private UUIDs until
separately approved retention cleanup; expiry/revocation still denies access.

Existing Google sessions without proof must sign in freshly through the Round 2
login link after enablement. Proof expires after 24 hours even if Supabase refresh
continues; fresh Google sign-in is then required. A Google login on an account
also linked to GitHub is accepted only when its *current exchanged credential*
passes Google verification. A GitHub credential on that account is rejected.

## Signup and second-member evidence

October 20 production metadata-only inspection independently confirmed:
`on_auth_user_created` is enabled, unconditional AFTER INSERT FOR EACH ROW on
`auth.users`, calling postgres-owned SECURITY DEFINER `handle_new_user()` with
path `public,pg_temp`. Its body inserts id/name/email/avatar, ON CONFLICT(id)
DO NOTHING. Defaults are role=user, is_banned=false, onboarding_completed=false.
The normal callback reads that existing profile; normal onboarding updates it.
Read-only catalog checks also confirmed all 29 selected onboarding columns are
SELECT-accessible and all 13 potential save columns exist and are UPDATE-accessible
to authenticated. Own-row SELECT/UPDATE policies allow the caller's profile;
the enabled role/ban guard does not alter ordinary onboarding fields. This is
catalog/source compatibility evidence, not a production signup execution.

The exact observed trigger body is rehearsed in a disposable fixture with
synthetic policies/columns. This supports the expected creation/update path;
it does NOT prove a new hosted production signup or every hosted policy behavior.
No production account, session, participant or schema was changed.

Only one controlled Google identity is verified in the private tester inventory.
No distinct second-member identity is available. Real distinct-member Google
onboarding remains UNTESTED. Synthetic distinct-user SQL binding/role and later
member onboarding are covered; the prior hosted member negative case reused the
leader account and is not evidence of a two-person OAuth journey.

## Verification commands and limits

Final runs: **54/54** Google/callback/core route tests, **26/26** release/browser/
workshop tests (including real isolated desktop/mobile browser runs), **91/91**
SQL authorization/concurrency checks, **12/12** signup-trigger checks; TypeScript,
scoped ESLint (eight files) and `git diff --check` PASS. **Webpack production build
PASS**, followed by **8/8** local production HTTP checks: public portal/workshops
200, private disabled pages 200, APIs 503, private/no-store/no-referrer headers.
The loopback stub counted zero Round 2 database calls while disabled. This is
not a claim about production telemetry. Default Turbopack remains locally blocked
as explained below. No final failing assertion remains in the rerun suites.

October 21 staging-only follow-up: the Google-only test overlay passed the actual
Vercel default `next build` on Next.js 16.3.8 **Turbopack**, compiling and generating
all 96 static pages. Final Preview `dpl_Cpaw4yB93nZty8ZKnWAMYi6yKsBe` is READY on
the exact approved alias, with staging-only environment and the original strict
Preview guard. Browser bundle inspection found one staging reference and zero
Production references; the unauthenticated Round 2 page is 401 with its login link.
All 18 guard cases were rechecked against the new overlay, and 9 real hosted
anonymous/service PostgREST denial checks passed. The subsequent real Google callback/proof acceptance is recorded below.
The management migration tool assigned staging ledger version `20261021041431`
to source candidate `20261020201500` (name `hustle_google_sessions`). No staging
ledger repair is proposed. Production still has neither this change nor its ledger.

```
node --test scripts/test-hustle-google-session.cjs scripts/test-hustle-phase2.cjs
node --test scripts/test-hustle-phase2-release.cjs scripts/test-hustle-carnival-workshops.cjs
node scripts/test-hustle-participant-sql.cjs
node scripts/test-hustle-signup-trigger.cjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/app/auth/callback/route.ts src/lib/hustle-phase2/server.ts src/lib/hustle-phase2/google-session.ts scripts/test-hustle-google-session.cjs scripts/test-hustle-signup-trigger.cjs scripts/test-hustle-participant-sql.cjs scripts/test-hustle-phase2.cjs scripts/test-hustle-phase2-release.cjs
```

SQL runs used existing PostgreSQL **18.4**, synthetic schemas/claims, ephemeral
loopback clusters and finally cleanup. They are not hosted Google/Auth/PostgREST
or PostgreSQL 17.6 validation of the new proof. Prior 48/48 hosted and 18/18
test-overlay guard checks predate this change and are not rerun/passed here.
New Google responses and callback exchanges in offline tests are synthetic.

Default Turbopack build is blocked by the pre-existing shared node_modules
junction pointing outside its filesystem root. No source guard/config was
weakened to bypass it. Webpack build uses locked installed dependencies and the
existing offline-font fixture. Early sandbox failures (initdb/browser temporary
file access, prerender EPERM) were rerun outside the sandbox. The strict release
browser mock initially lacked the new proof RPC; it now explicitly represents
an attested synthetic Google session, with denials tested separately.

## Remaining release gates and rollback

1. Review this source + unapplied SQL; publishing/staging/commit/push remain manual
   under workspace rule 8. No merge/deployment is authorized by implementation.
2. Rehearse the new proof bridge on the isolated staging Preview, including fresh
   Google callback and refreshed session, direct RPC denials and a distinct member
   if a verified controlled identity becomes available. Do not bypass hosted
   source gates or use original staging users. No GitHub hosted success is claimed.
   When porting to the existing test-only overlay, its callback must pass the
   actual trusted request origin into that overlay's `enabled(origin)` predicate;
   the production candidate's zero-argument gate intentionally has no Preview bypass.
3. Obtain separate production migration approval with reviewed exact bytes,
   current baseline/ledger, target/owner checks, transactional ledger handling,
   and a recovery decision for THIS additional migration. Earlier exceptions
   are not silently extended. Then separately approve disabled code release.
4. Only after hosted acceptance and roster reconciliation may the founder decide
   on source activation, flags, real roster import, batch activation and delivery.

Emergency rollback: keep/restore HARD-OFF first; do not retry failed SQL or repair
grants automatically. Restore the named prior disabled deployment `64e7279` only
with release approval. Keeping the additional database guard installed with old
code fails closed. Do not restore the broader identity helper or delete proof
records/table automatically: that would remove the Google restriction or data.
Any database rollback requires a separately reviewed migration/authorization.
No production action has occurred for this candidate.

References reviewed: [Supabase JWT claims](https://supabase.com/docs/guides/auth/jwt-fields),
[Auth session AMR implementation](https://github.com/supabase/auth/blob/master/internal/models/sessions.go),
[PKCE exchange implementation](https://github.com/supabase/auth/blob/master/internal/api/token.go),
[Google OpenID Connect userinfo](https://developers.google.com/identity/openid-connect/openid-connect#obtaininguserprofileinformation).

## Final hosted Google-only acceptance — 21 October 2026

The new Preview completed **58/58** hosted browser/server/PostgREST assertions,
plus **9/9** anonymous/service denial checks and **18/18** strict overlay guard
checks. These are new runs against this Google-proof change. Actual Google PKCE
returned to the approved alias; the server verified Google userinfo and issued
the current-session proof. No fixture minted the initial proof. Removing only
that server-issued proof denied the page, claim route and all four participant
RPCs. Restoring its exact original row restored access.

The controlled Google account was denied as an outsider, then claimed only its
separately activated synthetic shortlist. Inactive-batch claims, raw-table reads,
admin imports, organizer access, forged request identity and wrong invitation
were denied. The browser confirmed attendance only with a scoped staging clock;
one confirmation audit remained after idempotent, conflicting and concurrent
replays. A same-account member-role fixture could read its team but could not
respond or inspect a leader invitation. Ban denial and revocation of the real
current test session denied direct RPCs and server pages despite an unexpired JWT.

**Coverage limits:** actual GitHub OAuth and a distinct second-member Google
onboarding flow remain UNTESTED. GitHub-token/userinfo mismatch is covered by
local tests; the hosted negative used a genuine Google session with its proof
removed. A linked identity alone therefore did not grant access. Consumed OAuth
code replay was not captured in this run; do not count it as a hosted pass.
Staging still lacks the production signup trigger, so this new tester required
a narrowly scoped profile/onboarding fixture. That is not evidence of automatic
hosted profile creation. The exact production trigger body was inspected earlier
and passed 12 synthetic checks; no real production signup was performed.

Controller interruptions were closed-stdin coordination and transient connection
resets, not failed authorization assertions. Only unfinished phases resumed using
the same verified session; no extra user login was required. The final result has
58 passes and zero failed assertions. No production requests were observed in the
controlled browser; this does not establish production server telemetry.

Cleanup is verified: original **7 Auth users / 7 profiles / 5 public teams** have
identical full-row aggregate hashes to the pre-test baseline. All seven Phase 2
tables are empty. Only the new controlled test Auth account, profile, event and
campaign were removed. The canonical clock definition, owner and ACL were restored
exactly. Notification destination/secret remained absent, the notification function
hash was unchanged and the HTTP outbound queue was zero at checkpoints. No test
invitation or email was delivered. The temporary alias-only access link was revoked
and the dedicated Chrome profile removed. Approved staging schema/provider/Preview
configuration remains installed for testing; it is not a production release.

Production remains HARD-OFF. This ten-file diff and migration need independent
review, manual publication under rule 8, then separately approved production
migration and disabled deployment. No existing recovery exception is extended.
Distinct-member coverage or an explicit release decision on that residual risk is
still needed before activation. Production roster/import/activation/delivery are
separate decisions. The test overlay must never be merged.
## Distinct returning-member acceptance — protected-account follow-up

A further **27/27** hosted browser/server/user-scoped PostgREST assertions passed
with the founder-operated, distinct HackerMate-owned Google identity. Important:
although the founder identified this account as an admin, its actual existing
STAGING profile was already `user`. The test did not change it, query production,
or claim admin-role coverage. An initial controller assumption that staging would
also be `admin` stopped before fixture creation; a read-only check established the
actual `user` role and already-completed onboarding before testing continued.

A separate disposable two-slot roster used the previously verified Google tester's
email as leader and the distinct authenticated account as member. Neither slot was
manually bound. The existing member completed Google login/consent itself, received
real callback proof, claimed through the normal browser route, and bound only its
own member slot. The prior leader account had already been removed in earlier
cleanup, so its new roster slot was intentionally unclaimed. The page correctly
reported **1 / 2 verified**, not full onboarding. This is returning-member account
binding acceptance, not a fresh two-person signup/onboarding or 2 / 2 journey.

The member saw only its own projection and no attendance buttons. Direct user RPC
confirmation/decline, leader invitation claim/inspection and leader-context reads
were denied. The server attendance route also returned 403 with a valid copied
leader invitation context. Repeated own-account claim produced exactly one account
verification audit; team attendance remained pending with zero attendance audits.
No admin/organizer API or page was opened or called, and no elevated user privilege
was exercised. Synthetic roster setup/cleanup used the separately authorized
operator fixture connection, not the participant's session or any admin RPC.

Preservation verification passed for complete existing profiles, public teams and
memberships and the checked Auth authorization/settings fields. Original counts
remain **7 Auth / 7 profiles / 5 teams / 12 memberships**. No existing account,
profile, role, permission, membership or Auth configuration was modified. Normal
OAuth sign-in metadata/session creation occurred; only the new dedicated session
was signed out. All seven Phase 2 tables are empty again, the synthetic event was
removed, and the original clock was never changed. Notification destination/secret
remained absent and the outbound HTTP queue remained zero. Temporary Preview access
was revoked and its dedicated Chrome profile removed. The first cleanup connector
request failed with expired requestState; read-only reconciliation confirmed the
fixture remained, then a fresh scoped cleanup request and postflight succeeded.

Residual coverage: GitHub OAuth remains deferred; existing admin-role behavior and
fresh distinct-member automatic onboarding remain untested. No role was altered to
manufacture a pass. The new result closes distinct returning-member binding and
leader-only attendance denial, subject to those explicit limits. Source/SQL bytes
are unchanged; only this evidence documentation was updated. Production still
requires separate review/publication, migration, disabled deployment and activation
authorizations. No production operation was performed.