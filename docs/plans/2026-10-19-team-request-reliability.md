# Team-detail join-request reliability

Base: `fb3fd3df89836cc782f3123ef296cbc5600a1768` (verified remote main). Branch: `fix/team-join-request-reliability`.

Approved understanding: correct current application status for students viewing a team; preserve explicit submission, duplicate protection, invitation tokens, permissions and successful-request analytics. Current traffic requires no polling, service or dependency. Tests use synthetic local data. No database, discovery, Hustle or production changes.

Source audit: `checkExistingRequest` only writes true for a pending row, ignores request/membership errors and has no focus/auth listener. `loadTeam` also stores account-specific owner/invite/skills state without clearing it on identity changes. Submission has no synchronous lock or stale-identity fencing. Existing RPC locks the team and rejects an existing pending request; acceptance/instant joining can delete pending rows. No absent row establishes historical acceptance/rejection.

Decision: a boolean-only reset cannot handle unknown status or identity races. Keep corrections within the page and existing view: key account/team state, fence asynchronous work, use checking/ready/error status, provide explicit read-only Retry, refresh reads on return and team-change events, and reverify identity/status before explicit submission. Preserve RPC arguments and analytics payload. Do not introduce a generic data framework or refactor management workflows.

User explicitly approved this plan before implementation. Reproduce on baseline with real React synthetic tests, then implement the minimal correction. Cover removed pending rows, errors, duplicate clicks/rows, delayed authentication/results, route/account/logout/unmount changes, focus/visibility, successful/failed/duplicate submissions and invitation tokens/confirmation. Run related regressions, TypeScript, scoped ESLint, production build and desktop/mobile fixtures. Record screenshots, exact manifest, authorization/privacy and remaining manual verification in QA evidence before publication.
