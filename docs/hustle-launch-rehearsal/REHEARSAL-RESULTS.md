# Rehearsal results and GO/NO-GO — October 19, 2026

**GO for offline preparation and the tested local operating flow. NO-GO for real import/activation/distribution until the outstanding gates below are accepted.** This is an operations rehearsal, not Desktop's real Supabase Auth/PostgREST/security signoff.

## What ran

Application base: `6aaa4caaf33241c71b55f15987ec881e1f58ecfe` (latest main fetched for this task). Existing Phase 2 parser, standalone pages, actual Next routes, database functions and release/participation guards are unchanged. PR #32 was not checked out, edited or updated.

- Actual browser → Next UI/API → existing synthetic Auth/PostgREST adapter → **real disposable PostgreSQL 17.11** on loopback. Local fixture clock only; production release approval explicitly false in the child.
- **75 synthetic teams / 112 synthetic people**: 38 solo teams, 37 pairs. Every leader address is `example.invalid`, and WhatsApp fields are blank.
- **590 workflow assertions passed.** One inactive batch imported and read back; all 75 recipient panels matched Team ID, Team Name, Leader Name, Leader Email and “Not provided” for WhatsApp before the in-memory handoff simulation. All 75 leader journeys were exercised on alternating mobile/desktop viewports.
- **75 initial invitations**, one explicit pending-team revoke/reissue recovery. Raw capabilities were kept transiently in memory/browser. No messages, provider requests, clipboard handoffs or exported traces/screenshots/cookies/raw URLs/token hashes/server logs were retained. The disposable database stored invitation hashes as designed and was removed at shutdown. The raw tokens were checked absent from HTTP request URLs and in-memory Next/browser logs before those logs were discarded.
- **Three real minute-boundary rate waits** followed explicit HTTP 429 responses. The limiter was not bypassed, reset or changed. Initial issuance loop: **145.8 seconds**; overall software rehearsal: **375.6 seconds** before final cleanup. These are automated software timings, not estimates of safe human delivery speed.
- 74 simulated association-verified handoffs and one deliberately UNKNOWN simulated contact outcome; **zero real messages sent**. These are not sender/delivery receipts.
- Browser, Next server, loopback adapter and disposable cluster were closed/removed successfully; process exited 0. Aggregate evidence is in `rehearsal-evidence.json`.

## Authoritative count checkpoints

| Fixture stage | Shortlisted | Confirmed | Declined | Pending |
| --- | ---: | ---: | ---: | ---: |
| Activated before opening | 75 | 0 | 0 | 75 |
| Main response exercise | 75 | 45 | 15 | 15 |
| Last-millisecond acceptance and exact cutoff | 75 | 46 | 15 | 14 |

Every checkpoint reconciles `shortlisted = confirmed + declined + pending`. A generated link and a simulated/real message do not change a team response.

## Negative/recovery cases

| Case | Observed result |
| --- | --- |
| Duplicate/unknown headers or ungrouped participant headers with the canonical map | Real Next preview rejected with 400; no team writes. |
| Missing Team ID/leader, normalized duplicate ID/email | Preview returned validation issues and no receipt; no team writes. HTTP 200 alone is not a successful review. |
| Seven-column master, third-member column, duplicate phone, missing email, unsafe formula/control/shape/encoding/size | Offline parser/preflight tests reject; extra columns are not silently dropped. |
| Same leader/second-member name | Application parser rejects. |
| Shared person name across teams or list-style second-member cell | Human-review hold; no automatic splitting/identity inference. Verified namesakes/punctuation require explicit exact-record organizer + verifier resolution, not falsified names to force exit 0. |
| Deliberately false semantic mapping | Can pass syntax; this limitation is tested. Human authority/grouping remains mandatory and no approval is granted by the result. |
| Changed file / expired signed receipt | Commit rejected 409; no partial roster. |
| Inactive batch issuance | Rejected 409. Batch activation alone left all 75 pending. |
| Accidental reimport | All 75 existing teams flagged in preview, no receipt; commit rejected 409; still exactly one batch and 75 teams. |
| Wrong batch activation digest / organizer mutation | Rejected 409 / 403. Read-only organizer could view/search counts but not issue links. |
| Before opening | Valid leader saw “not opened”; response at **09:59:59.999 IST** rejected 409. Normal UI response succeeded at **10:00:00 IST**. |
| Same decision retry / opposite decision | Retry 200 with no second confirmation audit; opposite decision 409. No supported correction/reset was added. |
| Lost/misdelivered pending link | Blind create rejected 409; explicit revoke/reissue succeeded; old bearer cookie response rejected 404; replacement differed. |
| Cutoff | Decision at **22:59:59.999 IST** accepted; expired capability at **23:00:00 exact** rejected 404; issuance at cutoff rejected 409. |

The 590-flow run passed after correcting an overly strict browser-harness selector for the existing mapping labels. No application compatibility fix was made. The later offline membership-list/false-mapping tests are additional preflight contract coverage; they do not change the parser or the 75-team application's recorded results.

## Additional checks

- **24 offline preflight tests passed**, including the CLI's no-overwrite behavior, no row-value output and browser-equivalent UTF-8 BOM digest.
- **22 existing Phase 2 tests passed** and **18 existing release-gate tests passed** (64 automated tests total, separate from the 590 workflow assertions).
- Scoped ESLint, JavaScript syntax checks and TypeScript passed. CSV templates have consistent header/record widths. Existing manifests/lockfile, app/auth/SQL/configuration files and public participation guard remain unchanged.
- `synthetic-preflight-report.json` records the parser SHA256, raw-file SHA256, matching application preview digest and 75/112 counts without participant rows.

## Outstanding gates and practical decision

**Club Ellusion, before October 22:** final-file owner and precise late-handoff time; final team/person/solo/pair totals; official grouping/IDs/names and one leader per team; verified complete email/optional international WhatsApp destinations; duplicate/namesake/member resolutions; named sender/account/channel/capacity/message; paired operators/shifts and reachable correction/incident lead; private storage/retention policy. See `STAFFING-AND-DEPENDENCIES.md`.

**Technical release owner/Desktop:** final exact candidate and independent real Auth/PostgREST/security acceptance; verification of the already-reported migration/access state; actual privacy/logging/recovery/rollback/configuration readiness; separate authority for live import, batch activation, invitation issuance and individual delivery. This package does not run those steps or assume earlier approval covers them.

**Actual-file gate:** ChatGPT structural inspection plus organizer authority/identity/grouping attestation, independent row-by-row projection verification, correct totals, no structural issues, resolved review flags, fresh live exact-file/mapping dry run and inactive readback before any approved activation. Offline preflight cannot detect production reimports or authenticate mapping semantics.

**Staffing/time:** minimum two active operators plus a named third Club lead/backup; reserve approximately **4–7 initial elapsed hours** for 75 teams, with separate monitoring/relief through 23:00. Preserve the historical **838-action** planning baseline. No software timing or speculative provider limit proves that real individual invitations have been sent/delivered.

No merge, push, deployment, production/staging database operation, real account provisioning, live feature activation or real communication was performed. Cost: **₹0 additional services/dependencies**. Public workshop follow-ups and PR #32's visual approval remain separate.
