# Mission 03 post-release production acceptance

Audit date:2026-11-05; individual log windows below are exact. Release under review:46d7fcdbdfb53e7dc8d2fa0ce4e830b0a8890566, https://www.hackermate.in. This report distinguishes installed evidence, source evidence and synthetic behavior. No production write or authenticated account journey was performed.

## Assessment

**NO-GO for full production authorization acceptance.** Installed-equivalent native reproduction confirms P1 messaging authorization gaps STAB-027/STAB-028. Correction is prepared in separate [security Draft PR #121](https://github.com/yashshah1211/HackerMate_Backup/pull/121), migration20261105143908 unapplied. Deployment identity/availability is confirmed. Empty recent error results do not demonstrate exercised protected paths or refute the authorization findings. No live exploit or customer private-message read attempted.

One genuine P2 defect was reproduced in deployed source: **STAB-026**, resource deletion falsely reports success on a zero-row RLS result. The data is not deleted, so this is a persistence acknowledgment defect, not an authorization bypass. The affected delete journey is **not accepted** pending the separate fix. The correction is isolated on fix/workspace-link-delete-ack-20261105; its Draft PR URL/final-head CI is recorded in the delivery and PR metadata. Nothing from that fix is deployed or merged by this audit.

The Supabase connection became available during resumption. Fresh catalog-only READ ONLY queries independently confirm installed workspace migration20261105132849, task/link/document actor policies, effective mutable/immutable grants, profile visibility, supported RPCs, enabled triggers, app_settings permissions and realtime publication. No customer rows, app_settings values or secret-bearing notification function bodies were read. No credential fallback or impersonation attempted.

**Confirmed P1 messaging findings:** installed policies/functions omit protected suspension checks, and disposable native PostgreSQL with those definitions permits banned reads/sends/previews/reactions/deletes/receipt/pin operations (STAB-027). Review additionally reproduced stale team-participant reaction/inbox access and unfiltered participant reassignment into a foreign private DM (STAB-028). Actual installed metadata is verified; live production exploitation is untested; candidate native21/21 and both independent reviews pass; production application is absent. These levels are distinct. Existing task/link/document Mission03 boundaries remain confirmed and are not claimed broken.

## Evidence classification

| Category | Observation | What it establishes / does not establish |
| --- | --- | --- |
| Live read-only deployment | Vercel domain resolution returns dpl_A2L2py3QwgucYQ6fLcLZYtJKhoDs, production/main, READY, alias www.hackermate.in, exact46d7fcd commit | Independently confirms deployed artifact and domain target; READY is not an authenticated workflow test |
| Live deployment history | Latest3 production records show46d7fcd, prior7fc7acc andcad50fa | Expected Mission03/02/schedule lineage; no rollback/promotion/configuration action performed |
| Live build events | Build completed in /vercel/output, deployment completed. Returned100 events include npm cache-dir/install-script approval warnings | No build failure in retrieved events; API capped the response at100 even with all-events request, so no claim of exhaustive log capture. Warnings are not a demonstrated authorization regression |
| Live runtime-error query | Project error clusters, since1h: no errors returned | Bounded server-observability result, not browser errors or every Supabase response |
| Live runtime logs | Deployment-scoped30m,13:40:54.807–14:10:54.807UTC: no level groups and no permission denied entries | No matching retained entries, not proof of request traffic or exercised protected paths.1h raw-log request was rejected by Hobby retention; narrowed30m succeeded |
| Live anonymous HTTP | /,/login,/teams return200; /dashboard and /messages resolve to/login200; synthetic-ID workspace route returns200shell; GET/api/upload/presign returns405 | Route transport/sign-in redirects and method boundary only. No JS/authenticated read/write, workspace permission or RPC semantics certified. No existing user/team IDs were selected |
| Source equivalence | Fresh origin/main equals46d7fcd. git diff against tested7d7633d shows identical src/scripts/.github/package manifests; migration rename is100% identical body | Synthetic fixture behavior applies to the same application code. Source equality is not installed schema/grant equality |
| Installed workspace catalogs | Version20261105132849, RLS/current actor policies and effective grants independently re-read | Task/link active owner/member gates and creator-or-owner deletion intact; immutable UPDATE denied, mutable fields retained; documents restrictive actor policy and revision guard retained |
| Installed messaging catalogs | Actual policy/function/owner/ACL/search_path/schema snapshots captured in security PR #121; candidate version absent | Confirms native reproduction baseline and review compatibility, not a live authenticated exploit |
| Notification prerequisites | Existing release preflight18/18 predicates true; app_settings RLS/no anon-auth policy, service CRUD, enabled notification webhook and dependency metadata | Prerequisites intact; no setting values, notifications, job dispatch or provider delivery tested |
| Supabase retained logs |13:38:09–14:30UTC:51edge/13PostgREST/2Postgres entries, zero42501/permission denied/PGRST202-204 mentions | Bounded observation, not proof of protected requests or absence of browser errors |
| Live authenticated results | **None** | No owner/member, revocation, ban, send, document save, read receipt or mobile authenticated production journey run |

## Permissions and RPC compatibility review

The checked-in applied migration requires current owner/member plus protected profiles.is_banned=false for task/link SELECT/INSERT/UPDATE/DELETE. DELETE also requires creator or owner. Table UPDATE and independent immutable-column grants are revoked for PUBLIC/anon/authenticated; mutable task fields title/description/status/priority/assignee_id/due_date and link fields title/url/category/hackathon_id remain. Document active-actor restriction is ANDed with existing membership policy. No profile/SELECT grant narrowing was introduced.

Source save_team_document(uuid,uuid,integer,text) remains SECURITY INVOKER/jsonb with saved/conflict/missing shapes and revision checks; its trigger still guards content/revision/identity and stamps author/time. Client uses exact projection id,team_id,content,revision,updated_at,updated_by. Banned RLS visibility can produce missing; it must never be interpreted as saved. Source client still calls ensure_team_conversation(team UUID), mark_conversation_read(conversation UUID), and send_message_with_mentions(conversation UUID,content,mentions,reply UUID). No production call to these mutating RPCs was made.

**Fresh installed checks completed individually through catalog-only READ ONLY queries:** workspace migration/version, applicable policies/RLS, effective role/column grants, profiles.id/is_banned visibility, messaging function signatures/EXECUTE/owner/search_path, document/notification/member triggers, app_settings prerequisites and publication. The [preflight artifact](MISSION_03_READ_ONLY_PREFLIGHT.sql) was not executed verbatim as one batch; its checks were inspected in individual read-only queries because the connector returns only the last SELECT. Re-run fresh preflight after any approved deployment/migration and before controlled acceptance. Messages/tasks/links/documents are published to realtime; participants are not. No live realtime transport is certified.

Installed reaction schema differs from newer source migration: no conversation_id, only five columns and four-key add/remove RPC JSON. Current reaction realtime filtering expects conversation_id; this alignment and different-emoji uniqueness behavior remain separate acceptance limitations, not fixed by the P1 migration. Profiles' protected role/ban update trigger is enabled; broad table UPDATE alone is not evidence that actors can self-unban.

## Fresh synthetic execution

Executed against source identical to deployed application code, with external services blocked or replaced by synthetic adapters:

| Selection | Result |
| --- | --- |
| Mission02/03 state/history SDK, authorization/upload boundaries, daily claim/Founder Brief |102pass/0fail/0skip |
| Native PostgreSQL task/link/document actor boundaries |19pass/0fail/0skip; fresh disposable localhost cluster and cleanup |
| Native document concurrency |Pass: competing writers, conflict/override/third writer, concurrent creation, RLS/legacy denials and FK cleanup |
| Account/collaboration browser scenarios |2pass, both1440/390widths, zero external requests/page errors |
| Synthetic core query smoke |Pass,10reads/0mutations; query transport/static profile projections, not complete live pages |
| Initial mixed Windows selection |90pass/1file-level failure: unchanged Linux report runner rejects CRLF workflow marker before any shell/curl execution. Retained as environment limitation, not a production failure or hidden skip. Supported selection above rerun102/102; prior hosted Linux gate included its30passing cases |
| STAB-026 follow-up focused tests |39pass including3 new zero/denied/success resource tests, plus TypeScript pass; affected ESLint diagnostics unchanged8errors/1warning in workspace,0 in test |
| STAB-026 broader follow-up |1,041local PR application checks pass, desktop/mobile browser2/2pass; full ESLint192errors/90warnings→192/90, zero added diagnostic identities/multiplicities. Linux-only30shell cases remain in hosted CI |

Counts overlap and are not unique totals. Historical Mission03 hosted1,068/native19/browser2 and safe-build evidence remains in the release handoff. It is not relabelled as a fresh live authenticated result. Follow-up fix CI is recorded separately in its PR.

## Confirmed follow-up: STAB-026 (P2)

Production-source handler handleDeleteLink calls DELETE byid with no returned projection and treats error=null as proof of deletion. RLS DELETE is permitted to affect0rows without an error (for example, creator access was revoked while the workspace remained open). Actual mounted production component supplied that database result: success toast appears and resource disappears locally although deletion was unconfirmed. Native permission tests independently establish zero-row denial for removed/banned creators. No live DELETE was used to prove this.

Failing-before regressions in scripts/test-mission03-state.cjs exercise zero-row behavior and exact scope/projection. The fix uses id+team_id, SELECT returnedid/maybeSingle and requires an affected row before success/removal. Explicit database errors still log. Valid deletion behavior is preserved; no schema, public HTTP contract or permission change. Three after-tests pass (zero, denied, deleted). The original3case before-run failed; only the zero case demonstrates false persistence, while the other failures assert the missing scope/returned-id contract. No production data loss or unauthorized write was demonstrated.

## Founder Brief and remaining risks

Release workflow still has exactly37 3 * * *, cancel-in-progress=false, repository/main-only condition, curl retry0 and permanent dispatch claims. Claim/Founder Brief synthetic checks pass. No workflow dispatch, cron endpoint, report/email send or production app_settings row was invoked/changed. Actual future scheduler execution and delivery remain outside this audit; never force a send to establish them.

STAB-006 remains open: public presigned PUT does not demonstrate verified bytes before publication; successful contract preserved. STAB-011 remains separately blocked on authorized non-disclosing credential equality verification. No secrets were retrieved, compared, hashed or rotated. Chat/task transport ambiguity, simultaneous-client last-writer semantics, cached content after revocation and live realtime behavior remain documented limits, not silently certified guarantees.

## Required next decisions

1. Review [security Draft PR #121](https://github.com/yashshah1211/HackerMate_Backup/pull/121). Separately authorize any production migration/deployment only after its final-head CI, independent review and fresh metadata preflight. Full authorization acceptance remains NO-GO until the P1 corrections are applied and verified. No rollback that reopens these gaps is implicitly approved.
2. Review the separate STAB-026 Draft PR. Do not merge/deploy it automatically; rerun affected acceptance after any approved deployment.
3. Separately approve [the controlled acceptance plan](MISSION_03_CONTROLLED_ACCEPTANCE_PLAN.md):4 dedicated identities,1 test-only workspace, bounded mutations, removal/suspension,66send attempts (64expected accepted plus2denials), notification recipients/window, cleanup and retained safety/audit tombstones. No production test accounts have been created and no such test has begun.

Full GO requires approved P1 remediation, fresh catalog agreement, successful authorized owner/member/revocation/suspension/document/chat/account/mobile journeys and documented cleanup. The prepared controlled acceptance plan remains stopped for separate founder approval; no disposable production accounts/workspace exist. STAB-006 remains open and STAB-011 separately blocked.

### Final read-only observability refresh

15:10–15:40UTC Supabase aggregate:398edge,109auth,2auth-audit,5Postgres,17PostgREST,4realtime entries. No permission-denied/42501 mentions;3PGRST202 edge responses are POST /rpc/get_recommended_teammates_v3 with404, outside messaging. Catalog has no V3 function; existing client explicitly falls back on PGRST202 to get_recommended_teammates (catalog present), and same window has4HTTP200 responses there. Aggregate counts do not prove caller-level fallback success. Existing synthetic fallback regression passes; no new user-facing regression established, no integration changed. No auth headers, identities or response bodies read as evidence.

Vercel refresh: no error clusters since1h, last30m grouped1info/1warn; permission-denied search0. Warning-level filtered records returnednone, so its content was not established; do not call the entire window empty. Production remains46d7fcd/READY. Documentation head01db122 run42056966056 actual logs:1071offline/19native/2browser, document concurrency/TypeScript/smoke/artifacts pass. Subsequent plan clarification is documentation-only and must pass its own final-head CI.

### Production identity advanced independently during the audit

Latest read-only domain resolution now returns affa1f6f6248f4a7273b124d2618b8463aa8207f/READY, deployment dpl_D7SQ3v5TiceinZFk3wNgaPYmFUzN, after externally merged PR#122 organizer outreach. Earlier46d7fcd evidence is the original Mission03 baseline, not a claim of current deployment identity. PR#122 changes no messaging/workspace SQL or implementation. Fresh read-only recheck confirms7original messaging body fingerprints/definer/owner/search_path stillmatch, workspace migration installed and security candidate absent. Production authorization NO-GO remains; no live acceptance of the new outreach feature is claimed. This audit did not invoke its endpoint/scheduler or perform a deployment.

This branch integrated affa1f6 by normal merge7dd3ef6c653e37b2d4dc6a4c7c9812ad25251f54; STAB-026 source/tests and the controlled plan are unchanged by integration. Both inherited outreach and existing Mission01–03 CI selections retained. Exact final HEAD/combined actual CI is in PR#120 metadata/delivery. All controlled writes remain stopped pending approval; approved target must be the final remediated release, not either pre-fix production commit.

Combined latest-main security branch local validation:1052offline tests, safe build3synthetic reads/0writes and sequential TypeScript pass. Full lint192errors/92warnings includes two inherited unchanged upstream outreach-test warnings; no security diagnostics added. This acceptance branch retains three additional link-delete checks (hosted combined selection expected1085), while security PR expected1082. Actual final-head results, not expectations, are recorded in PR metadata/delivery after CI. No production endpoint/scheduler invoked.
