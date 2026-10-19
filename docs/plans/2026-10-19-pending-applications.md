# Pending team applications

Approved in chat on October 19, 2026: a **read-only** Pending applications section in `/my-teams`, based on main `9c857b27e6b1d335ee381831743696103acc16ee` (including merged PRs #35 and #36). Owner-supplied baseline: 35 pending requests across production; this is not a per-student count.

## Scope and assumptions

- Show the authenticated student's current pending applications, separate from memberships.
- Reuse existing authorization, RLS, components and routes; no database changes, production writes, paid APIs, dependencies, email, background jobs, polling or new analytics.
- Current traffic needs no new infrastructure. Keep implementation and maintenance local to `/my-teams`.
- Independent loading, error and retry states must preserve successful membership data and suppress unverified totals/empty states.
- Clear private state on logout/account switching and ignore stale or unmounted responses.
- No accepted/rejected/withdrawn history, inferred outcomes or response-time promises.
- Do not modify Cloud's branch, TeamsView, useTeamsData, TeamsTabs, request/approval workflows, #36 analytics or Hustle Carnival.

## Audit and decision log

The original page reads memberships but has no outgoing application list or local identity/stale-result handling. The tracked SELECT and DELETE policies in `20260823130000_optimize_rls_initplan.sql` authorize the requester **or** team owner. The outgoing list therefore needs an explicit `user_id` filter even for team owners. The existing acceptance RPC locks a pending row, adds membership and deletes the request. Other join paths can also delete requests. A missing row cannot establish its historical outcome.

Chosen and approved: read-only tracking. Alternative considered: withdrawal with explicit confirmation, a current-identity preflight, deletion scoped to request ID/team/user/pending status, synchronous locking and returned-row confirmation. The existing DELETE policy permits it, but it adds mutation races with acceptance/reapplication. Deferred to keep this release focused. Historical status tracking was rejected because deleted rows cannot establish outcomes and schema changes are out of scope.

Three local application files: guarded page, data/lifecycle hook and presentation. The existing TeamList presentation is carried over; its management/workspace links are fed only by actual membership rows. Pending rows get only team links. The shared TeamsTabs is imported unchanged.

## Data and lifecycle

Membership projection: `user_id, teams(id, name, description, owner_id, team_ppt_evaluations(id, total_score, grade, status, version))`, filtered to the verified user ID.

Application projection: `id, team_id, user_id, status, created_at, teams(id, name)`, filtered to the verified user ID and `status = pending`, ordered by newest date then ID, requesting an exact raw-row count. Legacy duplicates are represented once per team using the newest row's date. Missing nested team details retain an unavailable label and the known canonical team link. Only freshly verified memberships suppress lingering pending rows; stale membership data cannot hide a current application.

Each resource loads/fails/retries independently. Failed refreshes label retained rows as previously loaded; unknown counts and false empty states are suppressed. A response truncated by the server row cap is detected from the exact raw count and labeled partial. This release does not add pagination for that exceptional case.

Refresh on mount, explicit Refresh/Retry, window focus, visible tab return and the existing `hm:teams-changed` event. Auth callbacks invalidate synchronously and defer reads outside the callback. Abort signals, per-resource generations reserved before auth lookup, and identity epochs suppress stale successes/errors, including delayed authentication results. Cleanup removes listeners, unsubscribes and aborts on unmount. No realtime publication changes or live-push guarantee.

The audit reviewed [Supabase DELETE behavior](https://supabase.com/docs/reference/javascript/delete), [auth state changes](https://supabase.com/docs/reference/javascript/auth-onauthstatechange) and the [changelog](https://supabase.com/changelog). No client API migration is needed. Local migrations document intended RLS, not independent proof of deployed policy state.

## Validation and limitations

Use synthetic fixtures with all mutations forbidden. Test query scoping, user isolation, duplicates/null relations, counts, failures/Retry, partial responses, stale reads/auth, account switching, logout, unmount/remount and joining events. Capture before/after desktop/mobile screenshots from real components/CSS and run TypeScript, scoped ESLint, relevant regressions and the production build using synthetic non-production configuration. Deployed RLS, real sessions and Next middleware require separate authorized manual verification. Leave the Draft PR unmerged and undeployed.
