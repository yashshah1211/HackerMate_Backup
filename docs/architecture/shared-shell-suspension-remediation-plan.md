# Shared-shell suspension audit and proposed remediation

Status: **read-only audit and plan; implementation NOT approved or performed**.
Reconciliation date: 2026-10-16. Base `eed24a1384dd30dff05d13bf971f81e9ccac4f24`;
PR #21 reviewed at `22f5bdf6cd3f2c18753834991e04da0fd43b82fb`. The preserved
`review/comprehensive-ban-enforcement` work was inspected without modification.
All new probes replace Supabase and timers with local mocks. Production was not
queried, no RPC was invoked against a server, and no real token was used.

## Findings and evidence quality

### High: protected shell work does not require an active account

Confirmed source and actual React/hook probes:

| Surface | Work before any strict active-profile check | Current containment |
| --- | --- | --- |
| `useShellSession.ts:107` | Restores `viewerId` and cached name/role from `hackermate_user_cache`. Cookie/storage sniffing also sets `hasSession`. | Display cache is treated as enough to mount signed-in shell components. It is not verified identity or a grant. |
| `useShellSession.ts:210` | `getUser()` ignores its error, publishes the viewer ID before reading a profile. `SHELL_PROFILE_COLUMNS` omits `is_banned`. | No active-account verification exists in this hook, including on null/error profiles. |
| `useShellSession.ts:251` | Updates own `profiles.last_seen_at` immediately, on visibility, and every **180,000 ms**. | Continues after profile lookup error; no ban check. The older header comment saying 30 seconds is inaccurate. |
| `useShellSession.ts:120` | Notification count; DM `conversation_participants` joined to conversation type; unread `messages`; own `team_members`, owned `teams`, team details with `team_hackathons`/event metadata. | Identity/ownership filters remain, but actor suspension is not checked. DM channels depend on returned conversation IDs. |
| `useShellSession.ts:268,297` | Notification and per-DM `postgres_changes` subscriptions; callback reloads and notification toasts. | No auth/suspension listener or focus verification; cleanup is effect/unmount-driven. |
| `AppShell.tsx:34,157,172` | Runs the hook before bare/marketing route branches. On normal shell routes, any viewer ID mounts DailyStreakTracker, NotificationDrawer, AccountSheet and FeedbackWidget. | A blocked page subtree does not stop ancestor/sibling shell effects. Bare/marketing branches omit these sibling widgets but still run the hook. |
| `DailyStreakTracker.tsx:32` | Uses `getSession()`, then `record_daily_visit()`; no `getUser` or profile verification. | An actual AppShell probe with pending identity verification and cached viewer issues the mocked RPC immediately. Cache alone with no SDK session does not create an authenticated RPC. |
| `NotificationDrawer.tsx:114` | Calls `getUser` and subscribes to notifications even while the drawer is closed. Realtime callbacks load pending `team_invites` with team names and up to 50 notifications. | No account-status check; ignores identity error. `isOpen` gates only the initial list-load effect, not the subscription. |
| `NotificationDrawer.tsx:135,146` | Mark-one read updates by notification ID with no fresh identity check; mark-all checks only `getUser`, then updates own rows. | No active check. Optimistic UI/count updates remain on query failure. RLS must enforce both actor state and ownership. |
| `FeedbackWidget.tsx:39` | Explicit feedback submission checks only `getUser`, then calls `submit_feedback`. | Mount alone does not send feedback. The user-triggered RPC needs its own current actor guard; cached shell visibility must not imply permission. |

Offline probes establish request attempts and ordering. They do not establish that
all deployed tables accept those requests. Existing ownership filters do not
substitute for suspension checks; cached role alone does not establish an admin
privilege escalation. No cross-user data exfiltration was demonstrated.

### High: unguarded privileged streak RPC (deployed contract supplied by user)

The main conversation independently verified that deployed
`public.record_daily_visit()` is SECURITY DEFINER, executable by authenticated
users, updates streak data, and does not check caller ban state. The repository
body in `202608180007_daily_visit_streaks.sql` likewise derives `auth.uid()`,
explicitly rejects missing identity and missing profiles, reads daily streak state, updates three
profile columns, and inserts `builder_streak_history`, without checking actor
`is_banned`. The missing suspension check is the defect; the existing identity
and profile-existence checks are present and must be preserved.
`20260928100000_phase1a_definer_function_privileges.sql:453` preserves authenticated
EXECUTE and pins `search_path = public, pg_temp`; it does not add an active guard.

This is a confirmed unguarded privileged entry point reachable with authenticated
credentials. Hiding the tracker or blocking an API wrapper cannot secure direct
RPC calls with an already-issued valid access token. It is not a claim that a live
exploit was exercised. Exact deployed owner/ACL, FORCE RLS, triggers and full
dependency chains still need reconciliation before preparing executable SQL.

### High-priority lifecycle defect: cleanup can precede late resource creation

`useShellSession` checks `active` immediately after `getUser`, but not after its
awaited profile lookup before heartbeat writes, parallel private reads, timer
registration, and notification-channel creation. If cleanup runs during that
lookup, a later response can still execute this work and register resources after
cleanup has already run. The deferred-profile/unmount probe reproduces the
write, fake timer and fake subscription registration after unmount. This is a
confirmed application lifecycle defect, not proof of a server-side channel leak.

Ordinary cleanup clears resources already registered; `subscribeWithRetry` returns
a closure that calls `rawSupabase.removeChannel`. But ban detection in PR #21
does not unmount the ancestor shell, and the shell itself has no active-account
state to trigger cleanup. No auth listener means automatic `SIGNED_OUT` leaves
the mounted shell viewer/timer/subscription handles in place in the probe. SDK
socket behavior following that event is a separate, unverified question.

### Medium: failure-to-guest confusion and stale identity

- On a bootstrap result with `user = null`, the shell clears viewer/profile/teams
  and sets `hasSession = false`, without distinguishing a genuine guest from a
  failed identity lookup on an existing session. It does not clear every count,
  conversation ID, or previously cached private result in that branch.
- A thrown bootstrap failure logs an error and ends loading; it may leave the
  previously restored cached viewer/profile present. A hypothetical `user` plus
  `error` result is also accepted because the error is ignored. Actual SDK return
  combinations in production were not tested; the missing error check is confirmed.
- PR #21's verifier correctly rejects missing/null/error profiles and stale
  credentials that remain visible, but its boundary accepts any subsequent
  credential-free `SIGNED_OUT` result as guest. The lifecycle probe reproduces
  a blocked-to-guest transition without explicit user sign-out intent.
- Installed auth SDK source can remove an expired session after a non-retryable
  refresh failure and emit `SIGNED_OUT` (`GoTrueClient.ts:4959,4981,5089,5111`).
  Such an event is not proof of deliberate logout. No live refresh or cross-tab
  sequence was exercised. If credentials disappear before the first observation,
  a stateless verifier cannot reconstruct their prior presence.
- The shell's explicit sign-out clears its local cache/viewer before awaiting
  `auth.signOut()`, ignores a returned error, and hard-navigates. Successful local
  teardown does not revoke already-issued JWTs. A thrown call may prevent that
  navigation. Existing intervals/subscriptions are not explicitly stopped by the
  sign-out method before navigation.

`AuthGuard` and middleware are not compensating global gates. AuthGuard checks a
truthy ban flag, ignores profile query errors, and permits missing/incomplete
profiles on some routes; null ban states are not uniformly denied. Middleware
verifies identity and certain roles, without a generic active-profile check.
The existing server `requireActiveUser` is stricter: verified identity, existing
profile, `is_banned === false`, then existing resource authorization; explicit
invalid credentials never become guest. It is server-only and must not be
imported into a browser bundle.

## Smallest safe client remediation proposed for separate approval

No shell, AuthGuard, PR #21, shared Supabase infrastructure, or database file is
modified by this auth-return branch. Proposed follow-up files:

1. New `src/lib/auth/activeAccount.ts`: extract/share a browser-compatible,
   stateless verification contract from PR #21's existing verifier; use verified
   `getUser`, own explicit `id,is_banned,onboarding_completed` projection, exact
   ID match, and strict `is_banned === false`. Return checking/guest/active/
   suspended/unavailable states. Do not share a service key or import the server
   helper. `src/lib/hackathons/publicBrowsing.ts` can retain a thin adapter;
   coordinate any change to that Desktop-owned file before implementation.
2. `src/components/shell/useShellSession.ts`: own a monotonic account generation
   and the authoritative **client UI** status, extending existing ShellSession
   instead of creating a new auth framework. Cache may provide presentation hints
   only; publish a usable viewer ID/role after verified active status. Keep
   onboarding completion separate from account suspension so incomplete active
   users retain onboarding and intended public access.
3. Defer protected reads, heartbeats and subscriptions until active verification.
   On identity/token changes, focus recheck, suspension, unknown status or logout,
   immediately invalidate the old generation, close owned resources, clear private
   caches/counts/conversation IDs and unmount privileged shell widgets. Reverify
   outside the Supabase auth callback/lock. Coalesce duplicate verification work;
   do not add polling, unbounded downloads or positive authorization caching on
   the server.
4. Every async continuation must check generation/actor/disposal before *issuing*
   the next request, registering a timer/channel, or publishing data/toasts/counts.
   Use per-generation AbortControllers for supported queries, with explicit
   post-await guards even when cancellation is unsupported. Cleanup must be
   idempotent, run before sign-out, and cover late registration. Abort/unmount
   cannot undo an already-issued server mutation.
5. `src/components/shell/AppShell.tsx`: mount DailyStreakTracker, NotificationDrawer,
   AccountSheet and FeedbackWidget only for the verified active actor; public
   content remains available according to its public-read contract. Extend
   existing ShellContext session state as needed; audit its consumers rather than
   treating the cached role or `hasSession` as authorization.
6. `src/components/DailyStreakTracker.tsx` and `NotificationDrawer.tsx`: consume the
   verified actor/generation; gate each write, query, channel setup and callback.
   Avoid duplicate status lookups per drawer event. Mark-read must keep ownership
   filters, handle query failures honestly and discard old-account responses.
   Coalesce the shell/drawer notification channel if practical, but do not turn
   this into an inbox refactor.
7. Retain observed credential/block/failure provenance in the mounted shared
   session state. Automatic token removal must lead to an explicit recovery or
   "continue public browsing" choice, not a silent guest downgrade. Deliberate
   sign-out records intent, tears down protected resources, clears sensitive
   state, checks the SDK result, and permits public browsing. Do not infer intent
   from the `SIGNED_OUT` event alone or persist a client-side ban as enforcement.
   Cross-tab explicit logout semantics require a reviewed UX/test decision;
   failure history cannot be inferred after complete prior storage loss.
8. Separately coordinate PR #21 `BrowsingBoundary.tsx` to consume the shared
   lifecycle/provenance instead of independently downgrading blocked users, and
   align `AuthGuard.tsx` with strict profile semantics. Preserve verified active
   admin recovery/target protections, existing onboarding routes, and public pages;
   no founder/admin suspension bypass or implicit missing-profile provisioning.

Scope the follow-up to these auth/session consumers and focused tests. Reuse
`subscribeWithRetry`'s existing cleanup; do not redesign the shared Supabase client,
email delivery, pagination, scraper, or unrelated application UI.

## Authoritative database/RPC enforcement required separately

No SQL migration is drafted as executable or run here. Reconcile the existing
read-only preflight before any database-security PR:

- Capture complete deployed `record_daily_visit()` source, signature, return
  contract, owner, effective EXECUTE/default/inherited grants, search path, triggers
  on profiles/streak history, and nested function dependencies. Preserve same-day
  idempotence, date/timezone semantics, consecutive/missed-day logic, longest
  streak, history uniqueness and existing JSON contract for legitimate callers.
- Guard the authenticated actor **before privileged reads and writes**, using an
  existing profile with `is_banned IS FALSE`; missing/null/error must deny. Do not
  use `COALESCE(is_banned,false)`. Retain only intended EXECUTE grants and pinned
  object resolution; do not replace the function body with a guessed fixture or
  grant a service/founder bypass. Review whether a narrow profile lock is needed
  for ban/streak transaction ordering and test deadlocks/latency first.
- Add reviewed restrictive active-actor gates to protected reads/writes on
  notifications, conversations/participants/messages, private team/member/invite
  data and profile heartbeat updates, retaining ownership/member predicates and
  column ACLs. All permissive alternatives/ALL policies must be reconciled: an
  additional permissive active-only policy would combine with OR and be unsafe.
- Preserve intentional public reads: approved event projections, public profiles,
  team views and the explicitly public streak-history contract where approved.
  The repository history INSERT policy is own-ID only; it also needs a reviewed
  active-actor gate. Public columns must not become table-wide SELECT grants.
  Provide a safe self-status read if new profile restrictions would otherwise
  make suspended status unknowable, without exposing private columns.
- Verify clients cannot alter role/ban/id or recreate profiles through INSERT,
  upsert, deletion, triggers or definer RPCs. The committed profile UPDATE whitelist
  excludes role/ban/streak columns but includes `last_seen_at`; its deployment and
  complete effective grants remain unverified by this runtime.
- The prior report records 125 permissive policies and 57 definers; counts are not
  definitions. Full policy expressions/roles/grants, all relevant helper bodies,
  triggers, owners and recovery paths remain blockers. Production catalog facts
  were supplied by the main conversation, not independently queried here.
- Realtime publication membership does not prove authorization/eviction. Reconcile
  Postgres Changes reads, DELETE behavior, cached Broadcast/Presence authorization,
  token updates and existing connected-client behavior separately. Signed Storage
  URLs may remain valid until expiry. No immediate cutover/revocation guarantee.
- Existing bucket-wide pitch-deck Storage policies and the uncorrelated team
  GitHub repository INSERT membership predicate are separate ownership defects.
  A ban gate does not repair cross-team authorization for active actors. Keep their
  narrowly scoped corrections separate, without silently expanding this branch.
- The merged email-reliability route's suspension integration is still a separate
  approved auth-only follow-up; do not change provider logic or budgets here.

## Approval test matrix for the follow-up (not implemented enforcement)

| Area | Cases | Required result |
| --- | --- | --- |
| Initial anonymous state | No cache/credentials; preference cookies only | Public UI and approved public reads; zero protected reads/writes/channels. |
| Cache restore | Cached viewer/admin role with no session; pending identity; cache actor A/current actor B | Display cache never mounts privileged widgets; no cross-actor data publication or authority. |
| Active profile | Completed, incomplete, null completion | Protected shell allowed only for active actor; onboarding rules remain distinct; no automatic participation mutation. |
| Denial states | Banned, null/absent ban flag, missing profile, ID mismatch, profile error, auth error/exception, stale token | Explicit blocked/unavailable state; no protected side effect; never synthetic guest. |
| Initial credential loss | Credential removed during SDK initialization/refresh | Observed failure stays explicit; document when no historical evidence is available. |
| Automatic sign-out | After suspended/unavailable/active verification; removal during pending check | Resources quiesced; stale responses ignored; explicit public/recovery transition. |
| Deliberate sign-out | SDK success, returned error, thrown error, cross-tab intent | Cleanup precedes SDK call; honest outcome; legitimate public browsing preserved. No claim of JWT revocation. |
| Auth transitions | INITIAL_SESSION, SIGNED_IN as B, TOKEN_REFRESHED, focus, retry | One actor generation; no A-to-B data/channel/heartbeat crossover; no callback-lock deadlock. |
| Pending bootstrap | Unmount/ban/account change during each await | No subsequent write, timer or subscription registration; cleanup idempotent under StrictMode. |
| Running resources | Open/closed drawer; notification/DM events; visibility; heartbeat; team-change events | Stopped on revoked UI access; late callbacks cannot query, toast, or repopulate private state. |
| Consequential writes | Streak, mark-one/all read, bookmarks | Active check plus preserved ownership; failures remain failures; no duplicate/replayed mutation. |
| Stale responses | In-flight counts, invites, messages, profile, RPC and mark-read responses | No old-account state or success; abort best effort; already-issued operations remain DB-authorized. |
| Admin and unban | Verified active founder/admin, banned admin, null profile, valid unban | Existing recovery and target rules preserved; no role exception to active status; explicit reverify restores access. |
| Real RPC in isolated PostgreSQL | Anonymous/active/banned/null/missing with retained JWT claims and same-day repeat | Banned/unknown denied before effects; genuine active streak semantics unchanged; transaction data assertions. |
| Direct table bypass | Same retained claims: private reads, heartbeat, history INSERT, inbox updates | Active AND existing ownership; unrelated actor denied; legitimate public reads unchanged. |
| Grant abuse | Self role/ban change, ID reassignment, profile recreation, definer overloads, PUBLIC/inherited EXECUTE | No alternate path bypasses actor gate or broadens access. |
| Database concurrency | Ban commits before RPC; races with streak/history; unban | Defined transaction-order guarantee, bounded locks, no deadlock/data drift; no promise of recalling completed work. |
| Realtime feasibility | Existing channels, token refresh, DELETE, Broadcast/Presence cache | Version-matched isolated evidence before any separately approved cutover. |
| Existing regressions | Public hackathons, onboarding/invites, admin/partner auth, documents, current email implementation | No regression or out-of-scope modifications. |

## PR split, rollout and rollback gates

1. Auth-return hardening plus landing integration: this local branch reconciled with main PR #22 and reviewed PR #21
   `22f5bdf6`, no shell/SQL implementation. Await independent review and separate Git authorization.
2. Small client containment/lifecycle PR after explicit plan approval, coordinated
   with Desktop's browsing boundary. This reduces unwanted requests but cannot be
   described as authoritative suspension enforcement.
3. API authorization PR from the existing preserved suspension work, separately
   reviewed/published only when authorized. It does not intercept browser RPCs.
4. Reconciled RPC/RLS security PR: exact before/after definitions, disposable
   PostgreSQL tests and reviewed public/private contracts. Storage ownership,
   Realtime cutover and email auth-only integration remain separately scoped.

Before production work, obtain complete preflight outputs, prove status-column
visibility and ordinary active-user/recovery viability, capture exact definitions
and ACLs, validate a faithful isolated schema, and agree deployment ordering.
Monitor sanitized authorization errors and latency. Prefer a narrow correction
or temporary pause of the affected widget/RPC over weakening authorization.
Rollback only reviewed definitions in dependency order; dropping a deny gate
reopens a security gap and needs explicit review. Never disable RLS globally,
restore historical broad grants, unban everyone, or revoke live sessions as a test.

Client/shell implementation, executable database changes, migration execution,
Realtime cutover and Git publication remain unapproved. Read-only reconciliation
continues only within the existing authorization. No recurring cost or new
dependency is proposed.
