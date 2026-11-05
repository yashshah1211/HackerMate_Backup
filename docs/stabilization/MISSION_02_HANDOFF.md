# Mission 02 — messaging, teams, workspaces and state integrity

Base: `6e6b0e3b1fbb6b351112e011bed78e27033db258`. Branch: `stabilize/messaging-workspaces-20261105`. Isolated worktree: `stabilization-mission02-20261105`. Previous branch and original frontend remain untouched. PR #116 is confirmed merged at this base; Vercel reports its main deployment READY/production. Mission 02 does not merge or deploy.

Review: [Draft PR #118](https://github.com/yashshah1211/HackerMate_Backup/pull/118). Source/evidence head `247bb4ba7bae9efb66a2d2542506cd7122b7a1c8` passed [GitHub Actions run 42014251549](https://github.com/yashshah1211/HackerMate_Backup/actions/runs/42014251549). This documentation-only follow-up adds the references; PR checks are authoritative for the final head. Vercel lists zero deployments for the published source head.

## Reproduced defects and fixes

| ID | Priority | Demonstrated failure | Correction |
| --- | --- | --- | --- |
| STAB-016 | P1 | Old chat load/draft crosses thread/account identity; torn-down callback can act on old thread | Keyed session, guarded load/events, complete recorder/stream/timer/preview cleanup |
| STAB-017 | P1 | Two Enter events issue two writes; pending success erases newer draft/reply | Synchronous in-flight exclusion, revision/identity-aware completion, retained failed draft |
| STAB-018 | P2 | Rejected read receipt clears unread badge | Check acknowledgment before state update; log/show error |
| STAB-019 | P2 | Zero-row task DELETE shows success and hides task | Team/id scope and returned-row acknowledgment |
| STAB-020 | P1 | Prior owner privilege persists across team route; stale task comments overwrite current discussion | Fresh keyed route/owner flag plus active latest-request comment scope |

Root causes, exact reproduction steps and API limits are in BUG_REGISTER.md. These are five bounded defect areas; no new product feature, schema change, authorization migration or redesign was added.

## Before/after evidence

- Initial actual-component selection 7 checks / 0 pass / 7 fail on unmodified target paths. Separate workspace-owner navigation test fails before its route fix. Initial workspace fixture setup errors (missing named mock and void input children) were corrected before recording defect evidence; they are not counted as product failures.
- Existing baseline team/document/invite selection: 185 pass / 0 fail.
- First corrections passed 15 focused checks. Independent reviewers then reproduced orphaned recorder/tracks/timer, delayed microphone permission and unreleased preview URL: 3 new checks / 0 pass / 3 fail. A newly selected reply test failed separately. All were corrected before publication; these review regressions belong to STAB-016/017, not additional product scope.
- Final focused actual-component selection 19 pass / 0 fail / 0 skipped. Actual React renders, production handler closures and deterministic synthetic Supabase/media APIs. No assertion removed or weakened. Unread regression inspects the current DOM after review caught a historical-JSX assertion weakness.
- Actual Chromium at 1440px and 390px passes thread reset, duplicate Enter exclusion, newer draft retention, honest task deletion and route membership gate; zero external requests and no page errors. Existing guard Chromium passes both sizes. Screenshots in ignored scratch/mission02/browser; mobile task layout inspected.
- Native existing team-document PostgreSQL fixture passes competing writer/conflict, stale override, anonymous/removed-member denial, concurrent creation and cleanup checks. Fresh localhost cluster with synthetic IDs and finally cleanup; no production connection or migration applied.

## Validation

| Gate | Final local evidence |
| --- | --- |
| Updated exact PR offline selection | 1,021 pass / 0 fail / 0 skipped |
| Existing teams/memberships/documents/invites/moderation selection | 434 pass / 0 fail / 0 skipped |
| Full broader offline qualifier | 1,990 pass / 0 fail / 0 skipped |
| TypeScript | Pass |
| Production webpack build | Pass, 3 synthetic reads / zero writes, offline fonts/network guard |
| Auth and Mission 02 browser scenarios | 2 tests pass, each at 1440px and 390px |
| Synthetic core-page query smoke | Pass, 10 reads / zero writes; query transport, not complete page rendering |
| Native document concurrency/permission fixture | Pass, fresh native PostgreSQL18 localhost cluster |
| ESLint | 195 errors / 91 warnings baseline → 193 errors / 90 warnings final |

Selections overlap; counts are not unique totals. ESLint comparison uses file/rule/severity/diagnostic text with shifted source-location frames normalized, including multiplicity; no added diagnostics. Typed task comments remove one any; comment effect lifecycle removes one effect-state diagnostic; owner assignment removes an unused-variable warning. Existing module debt remains, including chat purity and messages hook diagnostics. No configuration/rule suppression or repository-wide autofix.

CI adds the state suite to the existing gate and the new browser scenario alongside the old one. All previous checks remain. Hosted run 42014251549 completed successfully on Linux/Node 22: TypeScript, 1,021 offline checks, synthetic smoke, both desktop/mobile browser scenarios and founder-brief artifact verification. Final-head success must be taken from the actual PR check, not inferred from local results.

Focused files: scripts/mission02-ui-fixture.cjs mounts actual production components; test-mission02-chat.cjs has 12 checks, test-mission02-workspace.cjs 6, and test-mission02-unread.cjs 1. test-mission02-state.cjs is the explicit 19-check aggregator; test-mission02-browser.cjs runs actual components/CSS against synthetic browser adapters. The split selection was rerun: 19/19 pass.

Focused commits: `172727d` chat/session and 12 regressions; `d36ec47` workspace/authority and 6 regressions; `43ebda6` unread acknowledgment and 1 regression; `1b373cc` browser/CI; `247bb4b` reproduction/review evidence. The documentation follow-up contains no runtime changes.

## Standards — independent review

Reviewer found that keyed unmount could orphan an active microphone. It reproduced recorder state/unstopped tracks/live timer in an isolated fixture. Added failing cleanup regressions, then stopped/detached resources and rejected late permission/media completions. Reviewer rechecked source and found no additional actionable issue or smell-baseline finding. Explicit profiles columns, team-scoped acknowledgment and error handling retain existing authorization. No production permissions changed.

## Spec — independent review

Reviewer independently confirmed the microphone lifecycle gap and pending-send clearing of a newly selected reply. It also identified that accumulated JSX props weakened the unread badge assertion. All corrected; reviewer independently reran the final 19 checks successfully and found no further blocker or scope expansion. Public APIs, SQL schema and grants remain unchanged. Agent reviews do not substitute for founder approval.

Review axis totals: Standards1confirmed lifecycle issue resolved; Spec2confirmed lifecycle/draft issues resolved plus1test-evidence weakness corrected. The shared lifecycle issue is counted once in implementation.

## Remaining limits and release recommendation

**CONDITIONAL GO** for review/merge after hosted CI and founder approval. Code-level reproductions and local integration checks pass. Production acceptance remains separate: real account switches, membership removal, message/read-receipt/realtime transport and storage delivery were not exercised. No production messages/notifications/emails, database records, credentials, RLS/grants or deployment settings changed.

STAB-006 remains open with presign contract preserved. STAB-011 remains blocked on safe application-side credential equality verification; database-side historical comparison is bounded evidence only. Neither is silently closed.

This batch does not assert exhaustive messaging correctness or backend exactly-once semantics. Ambiguous send outcomes, pagination during concurrent inserts, rapid task-field updates and live membership revocation remain investigation leads, not new confirmed defects. Existing server/document protections are retained. Do not introduce a new idempotency schema or alter permissions without separate authorization.

Vercel preview branch tracking was previously inspected off in this session; production tracks main. The connector project summary omits that setting, and current browser automation is disabled, so no fresh dashboard confirmation is claimed. Publish only the non-main review branch and verify deployment records afterward; no deployment/configuration action is requested or performed.
