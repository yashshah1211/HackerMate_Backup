# Post-release messaging authorization — review-only remediation

2026-11-05. Production baseline: `46d7fcdbdfb53e7dc8d2fa0ce4e830b0a8890566`.
**Production authorization acceptance: NO-GO.** The database fixes below are review artifacts, not applied or deployed. No customer-message read or live exploit was attempted.

## Recovery and evidence boundaries

Recovered existing `stabilization-chat-suspension-20261105`, branch `fix/chat-suspension-boundary-20261105`, at deployed baseline; four interrupted uncommitted paths were workflow, native test, query inventory and migration. No staging/security commit/PR existed. Separate acceptance branch `fix/workspace-link-delete-ack-20261105` contained eight committed paths and Draft PR #120, head19b249a. No reset, clean, history rewrite, replacement branch or duplicate PR.

Recovered ten-case native success was preliminary. Fresh read-only production catalogs revealed schema drift and independent review found additional bypasses; neither was silently treated as covered by the initial green tests. Original source/UI link deletion correction STAB-026 remains separate in [Draft PR #120](https://github.com/yashshah1211/HackerMate_Backup/pull/120).

| Evidence level | Established |
| --- | --- |
| Live deployment metadata | www.hackermate.in resolves to READY production deployment dpl_A2L2py3QwgucYQ6fLcLZYtJKhoDs, commit46d7fcd |
| Live installed catalogs | Workspace migration20261105132849 installed; messaging function/policy/ACL/schema metadata captured read-only; no customer rows or secrets |
| Disposable native exploit reproduction | Actual installed-equivalent policies/functions with synthetic actors permit suspended messaging and participation reassignment |
| Live exploitability | Not exercised; no suspended real account, private message read, authenticated write or malicious production request. No role-level pgrst.db_pre_request hook found, but this is not exhaustive API configuration evidence |
| Local corrected implementation | Real PostgreSQL regression, reapply, drift and rollback tests; synthetic application/browser tests listed below |
| Production remediation | Migration20261105143908 absent at catalog check. Not applied, merged or deployed |

## Confirmed defects

**STAB-027 / P1 — current actor and conversation authority missing.** Installed messages SELECT accepts participation or team membership/ownership without suspension; SECURITY DEFINER helper/send/inbox/setup/reaction/delete/receipt/pin paths bypass frontend guards and ordinary table RLS. An authenticated banned participant can read, send, preview DMs, react, delete own messages and change read/pin state in native reproductions. Direct conversation/participant writes and own-reaction DELETE also need a current-actor boundary.

Current roster revocation matters separately from profile state. A stale team participant permits reaction RPC access after removal. Installed constraints allow type='dm' with non-null team_id; a stored hybrid conversation with legitimate participants/messages permits stale inbox previews after removal even when the corrected helper denies access. Synthetic reproduction seeded the other participant/message; it does not prove attacker creation of another user's participation or that a production hybrid row exists.

**STAB-028 / P1 — participant identity move acquires private DM access.** Installed participant UPDATE has USING/WITH CHECK user_id=auth.uid(), table-wide effective UPDATE, and no identity trigger. An active actor's unfiltered `UPDATE conversation_participants SET conversation_id='<foreign DM>'` can move their own row into an inaccessible DM, after which helper/message reads succeed. WHERE/column RETURNING can invoke SELECT policy checks and conceal this bypass; the regression intentionally omits both. No production row was read to demonstrate it.

STAB-026 is reserved for PR #120. STAB-006 remains open with public presign contract preserved. STAB-011 remains separately blocked. Mission03 task/link/document restrictions are verified intact, not implicated by these findings.

## Minimal compatible correction

Inventory: [CHAT_ACTIVE_ACTOR_INVENTORY.md](CHAT_ACTIVE_ACTOR_INVENTORY.md), completed and supplemented before each permission extension. Exact non-sensitive installed snapshots: scripts/fixtures/chat-installed-functions.json, chat-installed-extra-functions.json and chat-installed-policies.json.

Migration `20261105143908_chat_active_actor_boundary.sql` changes seven existing function bodies:

- can_access_conversation requires a protected profile with known-false is_banned; team-associated conversations require current owner/roster, DM conversations require current participation.
- is_conversation_participant preserves own-participant semantics and also requires current access.
- get_my_dm_conversations returns no rows for inactive/missing actors and checks access per conversation; blocked/clear/unread/order/response semantics remain.
- ensure_team_conversation and get_or_create_dm add current actor guards, retaining membership, accepted friendship, advisory lock and UUID results.
- delete_message preserves own-author requirement and also requires current conversation access.
- toggle_message_reaction retains installed inline participant/member restrictions and adds current actor/access guards.

Four restrictive FOR ALL policies AND with existing permissive policies: messages and reactions require current conversation access; conversations require an active protected profile; participants require current conversation access in both USING and WITH CHECK. A SQL STABLE SECURITY DEFINER helper sees the pre-statement snapshot, so an actor cannot satisfy destination access by first moving their own row there within the UPDATE. This is an access boundary, not an immutability guarantee for every participant column.

No existing permissive policy, column, function signature, function owner/ACL/search_path, table grant, notification pipeline or Mission03 task/link/document policy changes. Pin/unpin/toggle-pin, plain/mention sends and receipts inherit the corrected helper. Related trigger-return functions are not ordinary callable RPCs; service-only add_user_to_team is outside authenticated exposure. This patch does not claim universal hardening of unrelated team/account RPCs.

Production reaction schema has only id,message_id,user_id,emoji,created_at and UNIQUE(message_id,user_id). The newer repository reaction migration is not installed. Preserve installed four-key success/action/message_id/emoji add/remove JSON, no new reaction columns, updated action or emoji-switch feature. Source realtime currently filters conversation_id absent from this installed reaction table; reaction realtime/schema alignment is a separate acceptance limitation and not repaired here. Existing different-emoji switching may hit uniqueness; do not claim that journey verified.

All 13 reviewed functions retain SECURITY DEFINER and search_path=public,pg_temp, owner postgres in production. Authenticated EXECUTE remains; anon EXECUTE remains denied. Service EXECUTE is absent for both sends/delete/reaction and retained for other reviewed functions, exactly as installed. Service-role table maintenance remains available. Active owner without roster retains existing team helper/send/ensure behavior; no new reaction owner privilege is added.

## Reproductions and validation

Run native tests with local PostgreSQL binaries, no .env/connection URL, fake UUIDs and finally cleanup:

`node --test scripts/test-chat-active-actor-local.cjs`

Set CHAT_ACTOR_BASELINE=1 only to replay original installed definitions without the candidate migration. Expected failures are evidence, not a passing acceptance run. Do not apply these fixture statements to production.

| Selection | Evidence |
| --- | --- |
| Installed baseline replay, final matrix |19 reported cases:7pass/12fail including parent, expected exit1. Forward-only drift/rollback tests do not apply to the baseline; initial expanded17-case replay was7pass/10fail |
| Independent stale reaction reproduction | Original19 suite green; added desired revoked-reaction denial fails Missing expected exception; tracked before-run19cases17pass/2fail including parent |
| Unfiltered participant reproduction | Independent native proof gains private DM read; tracked partial migration20cases17pass/3fail including parent (also one receipt assertion included a still-authorized DM and was corrected to target revoked team) |
| Hybrid preview reproduction | Independent inserted allowed hybrid shape; helperfalse/inboxpreview1; helper predicate makes0. Tracked hybrid-before21cases18pass/3fail includes parent and the receipt assertion correction above |
| Final messaging native matrix |21pass/0fail/0skip, including denial/allow, revocation, spoofing, missing/null profiles, original RPC shapes, additional permissive policies, existing-session suspension, exact ACL/owner/settings, migration reapply, metadata drift and rollback/reapply |
| Existing task/link/document native |19pass/0fail/0skip |
| Existing native document concurrency |Pass: real blocked writers, conflicts/override/third writer, concurrent creation, legacy/RLS denial and FK cleanup |
| PR application selection |1,038pass/0fail/0skip; Mission01–03 included. Windows excludes only unchanged Linux-only30-case report shell runner, mandatory in hosted CI |
| Broader offline qualifier |1,990pass/0fail/0skip |
| Chromium account/collaboration |2pass/0fail/0skip, both1440/390px, zero external requests/page errors |
| Synthetic core query smoke |10reads/0mutations; not deployed RLS or complete authenticated pages |
| Safe production build |Pass,3synthetic reads/0mutations, scrubbed environment, offline fonts/network guard |
| TypeScript |Pass sequentially after build |
| Full ESLint |192errors/90warnings baseline and candidate, zero added file/rule/severity/normalized-message multiplicities; baseline debt remains |

Counts overlap. Local Node24/PostgreSQL18 differs from production PG17.6.1; SQL uses supported existing features. Hosted CI uses Node22/native Linux PostgreSQL. Initial local HTTP cases failed socket EACCES, then unchanged selection passed with authorized localhost access; no tests or assertions removed. Existing build instrumentation/deprecation warnings remain outside this bounded patch. Local logs retained under ignored scratch/chat-acceptance.

## Independent review

Security/Standards and Correctness/Spec reviewers independently reran the initial19 suite, challenged its green result, and reproduced stale reaction access. Security reviewer additionally proved unfiltered participant takeover and hybrid inbox bypass, and independently validated candidate policies/helper guards. Earlier review caught an accidental search_path weakening and the installed reaction schema/response mismatch; these were corrected before finalization. Both final independent reruns pass21/21 with no further confirmed blocker in the reviewed scope. Conditional GO for Draft PR review only; production approval remains separate.

## Production preflight and rollout/recovery gate

Founder approval required for any live application. Fresh read-only metadata must still match captured signatures, owner postgres/messages owner, exact hardened proconfig, role execution privileges and reviewed normalized bodies. Migration transaction checks all seven definitions before permission changes, accepts original or candidate fingerprints for safe repeat execution, uses lock_timeout5s/statement_timeout30s and aborts on drift. It adds no data backfill. Review actual table schema/policies and any new integration first; do not bypass a failed preflight or force fingerprints.

After approval: capture metadata-only recovery snapshot; apply committed migration using normal controlled deployment procedure; verify installed catalog and active/suspended/removed dedicated-actor paths under separate controlled-account approval; inspect new permission errors; run core-page smoke and manual core pages as required. Live acceptance is still necessary after native/CI success. Existing reads already in flight and cached content are not retroactively erased; next committed READ COMMITTED statement is tested. No universal cross-client ordering/idempotency claim.

Prefer fix-forward. If a genuine compatibility incident requires recovery, founder must separately approve [review-only rollback](rollback/20261105143908_chat_active_actor_boundary.sql), which restores exact seven old definitions and drops only four new policies, preserving original ACL/owners and all task/link/document safeguards. It checks reviewed bodies/settings before changes. **Rollback reopens STAB-027/STAB-028**, so it is not a safe default response. Native test verifies old banned access returns after rollback and denial returns after forward reapply. On drift/timeout the transaction fails; inspect catalog and prepare a reviewed forward correction, never manually widen grants or disable RLS.

## Deployment dependencies and release decision

Read-only notification release preflight: all18 predicates true, including app_settings service CRUD/schema/key/RLS, notifications UUID/trigger/definer/JSON shape/pg_net prerequisites. No app_settings policies means anon/auth default deny despite effective table grants; service-role BYPASSRLS retained. Enabled notification webhook/document revision/team participant triggers and realtime messages/tasks/links/docs publication verified; participants not published. No setting values/secret function bodies or notification rows queried.

Supabase recent log window13:38:09–14:30UTC contained51edge/13PostgREST/2Postgres entries, zero42501/permission denied or PGRST202/203/204 mentions. Vercel error clusters empty since1h; retained raw30m window13:40:54.807–14:10:54.807UTC empty. These are bounded observations, not proof protected journeys were exercised. Production build READY and anonymous route checks do not certify authenticated behavior.

Founder Brief remains exactly `37 3 * * *`; serialized main-only workflow, zero curl retries and permanent at-most-once dispatch reservations unchanged. No trigger/job invoked, no messages/emails sent, no credentials/config/database records changed.

**NO-GO for full production authorization acceptance until these P1 boundaries are applied and verified through an approved release.** Local code can become review-ready after final independent review/CI; that does not approve production rollout. Required decisions: review security Draft PR, explicitly authorize migration/deployment separately, then approve the precise controlled account plan retained in PR #120. Keep both PRs unmerged pending founder approval; STAB-006 and STAB-011 stay open.

## Delivery record

[Draft PR #121](https://github.com/yashshah1211/HackerMate_Backup/pull/121), implementation HEAD `fdfbfad029e422ba982db2773c226fa6a505ee6c`: [hosted run42056441295](https://github.com/yashshah1211/HackerMate_Backup/actions/runs/42056441295), job127345981688, completed/success. Actual Linux/Node22 logs inspected:1,068offline/19workspace-native/21messaging-native/2browser checks pass, zero failures/skips; TypeScript, native document concurrency,10read/0mutation smoke and artifacts pass. Vercel lists zero deployments for that implementation head; production remains46d7fcd/READY. SQL body whitespace in forward/rollback artifacts intentionally matches captured definitions/fingerprints.

The security Draft PR description and final audit reply record the exact final HEAD and its inspected CI run, avoiding a self-referential commit hash in this file. Any documentation-only follow-up must also pass final-head CI. No prior green run substitutes for that result.

Read-only refresh15:10–15:40UTC:398edge/109auth/2auth-audit/5Postgres/17PostgREST/4realtime log entries; no42501/permission-denied mentions. Three PGRST202 responses concern missing get_recommended_teammates_v3, outside messaging; source has explicit V2 fallback and same-window V2 has4HTTP200 responses (not caller-level correlation). No new user-facing regression established. Vercel refresh has no error cluster, grouped1info/1warn and no permission-denied matches; warning content not established. Production still46d7fcd READY. No identities/headers/customer data queried.

## Final integration addendum — main advanced during audit

After the preceding implementation CI, origin/main advanced independently to affa1f6f6248f4a7273b124d2618b8463aa8207f (merged PR#122 organizer outreach). Production domain now independently resolves to dpl_D7SQ3v5TiceinZFk3wNgaPYmFUzN, affa1f6/READY. The earlier46d7fcd observations remain the original audited release evidence. No rollout action was performed by this audit.

Integrated latest main by ordinary merge c5f1288c2872e440432812b573545a3bc53033d9, preserving all security history without conflict/rewrite. The seven-function migration, native test/snapshots, chat/workspace implementation and Founder Brief workflow compare byte-identical to the independently reviewed candidate. PR workflow retains both the inherited scheduled-outreach test and new messaging native test; report shell/Mission02/Mission03 runners preserved. New main changes are inherited baseline, not additional security feature work.

Fresh catalog-only READ ONLY recheck after that observed deployment: all7 installed old function body fingerprints/definer/owner postgres/search_path match; workspace migration present; messaging candidate absent. Thus production P1 assessment remains NO-GO; a new application deployment did not apply this database correction. Combined integration validation and exact final HEAD/CI are recorded in PR#121 metadata and final reply. Current production settings/outreach jobs were not invoked or changed.

Combined local integration:1,052/1,052 PR application tests pass (inherited14outreach cases included; Linux30shell cases remain mandatory in hosted CI). Safe build passes3synthetic reads/0writes and sequential TypeScript passes. Full ESLint192errors/92warnings: two added warnings are unused nullTime/selected in the unmodified upstream outreach test, byte-identical to origin/main; no messaging-security diagnostic added. Independent Security reviewer confirms integration touches only six inherited files and preserves security artifacts and both CI entries. Broader qualifier rerun/final integrated hosted evidence is recorded in PR metadata/delivery after completion.
