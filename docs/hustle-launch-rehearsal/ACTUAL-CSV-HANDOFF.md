# Actual CSV handoff — fill only after official review

Status: **BLANK TEMPLATE / NOT AUTHORIZATION**. Do not populate this repository file with real participant data. Fill a private copy after the actual roster has been inspected by ChatGPT and independently verified by the authorized people. ChatGPT format review cannot authenticate the organizer, recipient ownership or grouping; those approvals remain human responsibilities.

## Source and approval record

| Item | Private handoff value |
| --- | --- |
| Official roster owner / authorized sender / received-at IST | `<name or approved internal reference / time>` |
| Final version and superseded versions | `<version / supersedes>` |
| Original file private location and raw-file SHA256 | `<private reference / digest>` |
| Approved Team ID scheme; official grouping reference | `<reference; explicitly confirmed, not inferred>` |
| Selected teams / total people / solo teams / paired teams | `<N / P / S / T; N=S+T and P=S+2T>` |
| Exactly one designated leader per team confirmed by | `<Club Ellusion approver / date / private evidence>` |
| Leader email / optional WhatsApp ownership verified by | `<owner and evidence reference; no raw contacts here>` |
| Duplicate IDs/contacts and membership/name collisions resolved | `<resolution reference, including any verified namesakes>` |
| Team/member omissions, unsupported columns and eligibility questions resolved | `<reference or NONE>` |
| Final shortlist revision/change freeze and escalation owner | `<owner / cutoff / approved change process>` |

If the source is participant-level, attach the **organizer-approved grouping/leader correspondence** privately before making a team-wise master. Do not use row order, college, surname, serial numbers or a model's guess as evidence.

## Reviewed projection and preflight

- Approved seven-column master private reference: `<reference>`.
- Exact six-column projection private reference and SHA256: `<reference / digest>`.
- Explicit mapping private JSON/reference: `<reference>`.
- Preflight parser-source SHA256 / code SHA / time IST: `<values>`.
- `--expected-teams`: `<official N>`; result/exit: `<zero structural issues and matching count; exit 0, or explicitly resolved name/grouping flags with exact-record Club Ellusion + verifier signoff for exit 3>`.
- Total/accepted teams and accepted-person count: `<must reconcile with official totals>`.
- Issues and grouping/count review flags: `<zero unresolved; prior resolutions referenced>`.
- Application preview digest: `<digest; not the raw-file hash or a signed receipt>`.
- ChatGPT structural review: `<time, file version/hash, findings; not identity approval>`.
- Human source-to-master-to-projection row-by-row verification: `<founder / independent verifier / signoff>`.

The real CSV, master, projection and reports remain outside Git/public artifacts. A changed byte/mapping/version invalidates the frozen package and requires review again. An offline pass does not check existing production records.

## Release and import authorization record

- Final exact candidate/deployment and Desktop security/integration acceptance: `<release owner / reference>`.
- Existing migration/current schema/access state verified by Desktop: `<reference; no rerun authorized here>`.
- Privacy/logging/recipient verification/sender capacity/rollback gates accepted: `<references>`.
- Approval scope: `<explicit live import / batch activation / link issuance / individual delivery; approver/time>`.
- Current production flags and deployed state confirmed by release owner without recording secret values: `<OFF or separately approved readiness reference>`.
- Approved operator, independent verifier, delivery account/channel, sender message and launch contact: `<references>`.

## Live operator readback — complete only under separate authorization

1. Live dry-run approved total / issues / exact digest: `<N / 0 / digest>`.
2. Same admin reviewed within the 15-minute receipt lifetime: `<yes / fresh review if not>`; **do not copy the receipt itself here**.
3. Commit result, authoritative batch ID, count/digest, inactive state and checked-at IST: `<values>`.
4. Existing roster conflicts or uncertain network outcome: `<NONE or HOLD/readback reference>`.
5. Independent inactive roster verification and separate activation approval: `<references>`.
6. Active batch confirmed; initial pending count: `<N>`.
7. Delivery ledger/current-attempt owner and private location: `<reference>`; links remain outside ledger.
8. Opening GO owner/time, delivery completion target, monitoring shifts and cutoff/incident contacts: `<values>`.

**STOP** if any item is unknown, inferred, contradictory or unsigned. This handoff does not grant configuration, migration, account, import, activation or messaging authority by itself.
