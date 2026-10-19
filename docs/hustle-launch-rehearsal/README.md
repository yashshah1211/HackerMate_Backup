# Hustle Carnival CSV-to-registration launch rehearsal

Prepared **October 19, 2026** for the late **October 22** official-file handoff and **October 23, 10:00 AM–11:00 PM IST** response window. Source is current fetched main `6aaa4caaf33241c71b55f15987ec881e1f58ecfe`, on isolated branch `chore/hustle-csv-launch-rehearsal`. PR #32 remains a separate unchanged review; no application, authentication, SQL, configuration or dependency files are changed here.

## Use this package

Start with [rehearsal results and GO/NO-GO](REHEARSAL-RESULTS.md): 590 real local workflow assertions and 64 automated tests passed, with zero real messages. Aggregate, synthetic-only evidence is included.

1. [CSV contract and offline preflight](CSV-CONTRACT.md): exact fields, mapping, limits, normalization and identity/grouping limitations.
2. [October 22–23 operator checklist](OPERATOR-CHECKLIST.md): approval sequence, expected outcomes, STOP conditions, recovery and cutoff.
3. [Manual delivery tracking](DELIVERY-TRACKING.md) with `delivery-ledger.template.csv`: generated, sent, delivery evidence and registration are separate states; no tokens in the tracker.
4. [Actual-CSV handoff template](ACTUAL-CSV-HANDOFF.md): fill a private copy only after ChatGPT inspection plus organizer/human approval of the real file.
5. [Staffing and organizer dependencies](STAFFING-AND-DEPENDENCIES.md): retain the prior 838-action baseline; two active operators plus a named Club Ellusion lead/backup; reserve roughly 4–7 hours initial elapsed work for 75 teams including verification and recovery margin.
6. Synthetic fixtures: `organizer-master.synthetic-template.csv` (seven columns/three teams); `import.synthetic-template.csv` (six columns/three teams); `synthetic-75.import.csv` (75 teams/112 people); `mapping.canonical.json`. Never import these into production.

## Repeat safely on disposable local infrastructure

Use a clean isolated checkout of the approved source with its lockfile dependencies, Node, local PostgreSQL command-line/server binaries and Chromium/Edge. No `.env`/`.env.local`, real accounts or live endpoints. PostgreSQL must run as an ordinary local user, not root. The existing fixture helper creates an ephemeral loopback cluster/database, installs the repository's fixture/migration locally, substitutes a clock **only inside that fixture**, and removes the cluster at shutdown.

```sh
node scripts/test-hustle-csv-preflight.cjs
node scripts/test-hustle-phase2.cjs
node scripts/test-hustle-phase2-release.cjs
node scripts/hustle-csv-preflight.cjs --csv docs/hustle-launch-rehearsal/synthetic-75.import.csv --expected-teams 75
node scripts/rehearse-hustle-csv-launch.cjs
```

Point `PARTNER_TEST_PG_BIN` at the existing PostgreSQL `bin` directory and `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` at the installed browser if necessary. This uses no new package or service. Example **Windows PowerShell**, after checking the installed paths:

```powershell
$env:PARTNER_TEST_PG_BIN = 'C:\Program Files\PostgreSQL\18\bin'
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
node scripts/rehearse-hustle-csv-launch.cjs
if ($LASTEXITCODE -ne 0) { throw 'Rehearsal failed; do not treat this as launch approval.' }
```

The Cloud run uses the previously prepared local PostgreSQL 17.11 tools at `/workspace/work/pg-tools/bin`, their extracted library directory through `LD_LIBRARY_PATH`, and `/usr/bin/chromium`. Those tool paths are execution-environment details, not product configuration or new dependencies. Do not copy them into Vercel, change production settings or download services to launch the feature.

The browser rehearsal binds ephemeral loopback ports, runs the **actual Next route handlers/UI**, and reuses the existing synthetic Auth/PostgREST adapter backed by real disposable PostgreSQL. The child explicitly keeps production release approval false, strips inherited service/release settings, and uses only the existing non-hosted loopback fixture gate. No ports are exposed publicly. Actual 30-admin-actions/minute waits are observed; allow several minutes. It exercises 75 individual recipient panels and leader journeys, never sending an email/chat/SMS or invoking a delivery provider.

Output is in ignored `test-results/hustle-csv-rehearsal/`. Only the sanitized aggregate evidence is copied into this package after a successful run. Tokens/links exist only transiently in process/browser memory; no trace, screenshot, raw browser state, credentials or raw server logs are saved. The report is not proof of real Supabase Auth/PostgREST behavior, provider deliverability, permissions/capacity or production readiness. Desktop's separate integration/security decision remains required.

## Release decision

**GO for synthetic rehearsal and offline shortlist preparation. NO-GO for the actual launch until all real-data, operational and technical gates are explicitly accepted.** A successful parser, local SQL simulation or dry run cannot establish organizer authority, identity/contact ownership, actual grouping, current production migration/access state or permission to enable flags, activate a batch or send capabilities.

Production migration has been reported complete. This package neither verifies nor reruns it. Hard-OFF also blocks the admin importer; any pre-opening live import/issuance must follow separate technical release approval. Before opening, the database window rejects decisions; at 23:00 exact, invitations expire and new responses fail. Keep the public ordinary-participation guard disabled.

The biggest late-file risk is missing or ambiguous team/leader/contact data. Get the team-wise format and named approvers agreed before October 22. On a late/incomplete file or missing release gate, hold and escalate instead of guessing, bypassing validation or promising 10 AM invitation availability. Bearer possession permits access; completed decisions have no supported correction workflow.
