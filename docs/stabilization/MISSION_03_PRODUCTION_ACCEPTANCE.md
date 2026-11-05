# Mission 03 post-release production acceptance

Audit date:2026-11-05; individual log windows below are exact. Release under review:46d7fcdbdfb53e7dc8d2fa0ce4e830b0a8890566, https://www.hackermate.in. This report distinguishes installed evidence, source evidence and synthetic behavior. No production write or authenticated account journey was performed.

## Assessment

**CONDITIONAL GO for continued operation; full authenticated acceptance remains unverified.** Deployment identity/availability is confirmed. No production runtime-error cluster or permission-denied entry was returned in the inspected recent window. Those empty results do not prove absence of browser/PostgREST errors, sustained reliability or traffic coverage.

One genuine P2 defect was reproduced in deployed source: **STAB-026**, resource deletion falsely reports success on a zero-row RLS result. The data is not deleted, so this is a persistence acknowledgment defect, not an authorization bypass. The affected delete journey is **not accepted** pending the separate fix. The correction is isolated on fix/workspace-link-delete-ack-20261105; its Draft PR URL/final-head CI is recorded in the delivery and PR metadata. Nothing from that fix is deployed or merged by this audit.

Fresh installed database policy/grant verification is blocked because the Supabase connection is not installed/available in this session. A connection was requested. Do not reinterpret the prior release addendum or founder's report as a new independent catalog query. No credential fallback, secret decryption or data-plane impersonation was attempted.

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
| Migration/source record | Release SQL filename20261105132849_workspace_actor_boundaries.sql; prior release addendum records successful catalog pre/postcheck and application | Founder/release-record evidence of applied version; not independently re-read from Supabase now |
| Live authenticated results | **None** | No owner/member, revocation, ban, send, document save, read receipt or mobile authenticated production journey run |

## Permissions and RPC compatibility review

The checked-in applied migration requires current owner/member plus protected profiles.is_banned=false for task/link SELECT/INSERT/UPDATE/DELETE. DELETE also requires creator or owner. Table UPDATE and independent immutable-column grants are revoked for PUBLIC/anon/authenticated; mutable task fields title/description/status/priority/assignee_id/due_date and link fields title/url/category/hackathon_id remain. Document active-actor restriction is ANDed with existing membership policy. No profile/SELECT grant narrowing was introduced.

Source save_team_document(uuid,uuid,integer,text) remains SECURITY INVOKER/jsonb with saved/conflict/missing shapes and revision checks; its trigger still guards content/revision/identity and stamps author/time. Client uses exact projection id,team_id,content,revision,updated_at,updated_by. Banned RLS visibility can produce missing; it must never be interpreted as saved. Source client still calls ensure_team_conversation(team UUID), mark_conversation_read(conversation UUID), and send_message_with_mentions(conversation UUID,content,mentions,reply UUID). No production call to these mutating RPCs was made.

**Fresh installed checks still required:** migration history/version, all applicable policies (including any unexpected permissive OR policies), RLS flags, effective role/column grants, profiles.id/is_banned visibility, function overload/signature/EXECUTE/security mode, document trigger, notifications trigger metadata, app_settings permissions and realtime publication. Prepared [catalog-only preflight](MISSION_03_READ_ONLY_PREFLIGHT.sql) uses a READ ONLY transaction and never selects customer rows, setting values or notification secret-bearing function bodies. It has not been run against production.

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

1. Make the Supabase connection available to complete the already-authorized catalog-only phase. Alternatively, founder runs the prepared read-only SQL and provides only its non-secret catalog output; that will be attributed as founder-run evidence.
2. Review the separate STAB-026 Draft PR. Do not merge/deploy it automatically; rerun affected acceptance after any approved deployment.
3. Separately approve [the controlled acceptance plan](MISSION_03_CONTROLLED_ACCEPTANCE_PLAN.md):4 dedicated identities,1 test-only workspace, bounded mutations, removal/suspension,64messages, notification recipients/window, cleanup and retained safety/audit tombstones. No production test accounts have been created and no such test has begun.

Full GO requires fresh catalog agreement plus successful authorized owner/member/revocation/suspension/document/chat/account/mobile journeys and documented cleanup. A demonstrated live authorization/data-integrity failure changes the affected release assessment to NO-GO and triggers a separately reviewed correction.
