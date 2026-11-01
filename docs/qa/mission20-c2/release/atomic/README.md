# Atomic expansion candidate â€” review only

**NO-GO for operator execution.** This is a deterministic candidate outside `supabase/migrations`, not an applied migration or release authorization. [Catalog reconciliation](../CATALOG-RECONCILIATION.md) distinguishes independently confirmed facts from missing evidence.

`01-final-expansion.review.sql` has exactly one BEGIN/COMMIT. A separately committed admission freeze and completed writer drain must precede it. The source-hashed 01/05/07/08/C2 cancellation proposals remain unchanged. The generator selects only the last definition of each function at its first dependency position; global SHARE and blocking roster-hook comparator bodies are absent, including before commit. Existing transaction wrappers are parsed at top level and omitted. Strings/dollar bodies are preserved. The unused private transfer test prototype is deliberately excluded; no replacement transfer feature is introduced. All four replaced existing writers preserve their original OIDs, owners and ACLs through CREATE OR REPLACE.

The preflight requires postgres on PG17, READ COMMITTED, confirmed event column types, the expected post-freeze ledger (148/latest-20261102090000: audited 147 baseline plus the separately recorded freeze), a restrictive committed-freeze state and no authenticated INSERT columns, absent Mission 20 namespace, and exact repository `prosrc` SHA256/owner/definer/search_path for four replaced functions plus the hardened internal add-member dependency. The helper is **not replaced or granted**. A missing function, altered body, ledger drift or namespace collision stops installation. The manifest records each dependency and hash. SQL cannot prove an earlier transaction was committed or that direct writers were drained; those remain external operator receipts.

The founder confirmed four deployed bodies only **after formatting normalization**, not raw-body hashes. The executable guard deliberately accepts exact repository body bytes only. A harmless live whitespace/comment difference therefore also stops. Obtain private raw-body SHA256 receipts using the SELECT packet; independently review any difference and regenerate an explicit allowlist if warranted. Do not remove the guard, compare only function names, or normalize string-literal contents to make it pass. `add_user_to_team` live hardening remains unresolved.

## Tentative version plan

| Unallocated version | Future boundary |
| --- | --- |
| 20261102090000 | Existing 00 admission freeze, its own committed transaction |
| 20261102090100 | Generated atomic final expansion/protocol/writers/cancellation |
| 20261102090200 | Existing 02 permission contract, after compatible adapters and the last freeze |
| 20261102090300 | Existing 06 unfreeze, only after independent acceptance/authorization |

These numbers exceed the reported latest ledger version but are **not reserved** or added to active migrations. Recheck the complete ledger, pending branches, production SHA and object snapshot before allocation under separate authority. No migration ledger INSERT/repair is part of the SQL candidate. Emergency 03 remains a separate incident action, never an automatic fifth rollout step. Freeze/community outage remains an unresolved founder decision.

The rehearsal executes candidate SQL with psql and models the prior freeze loader receipt synthetically. It does **not** qualify an actual Supabase migration loader's schema-plus-ledger atomicity. Before promotion, independently select/rehearse the exact loader and its transaction ownership: do not put this explicit COMMIT inside an assumed outer transaction or allow ledger failure to be mistaken for a schema rollback. Wrapper adaptation belongs to the reviewed future migration packaging. If schema and ledger disagree, STOP and inspect; do not repair history or retry an existing namespace blindly.

## Qualification and rollback contract

`scripts/qualify-mission20-atomic-candidate.cjs` allocates a second fresh database inside the existing disposable native cluster; it accepts no connection input. The fixture runs the existing privacy assertions, models DATE event dates, TIMESTAMPTZ registration dates, VARCHAR(50) type, confirmed defaults/identity/uniqueness/CASCADE, actual repository matchmaking, reviewed conversation hooks and canonical deletion. A synthetic 147-row baseline ledger plus the future freeze loader receipt models count/latest metadata only; it is not a copy of production migration history.

The tests require: reject absent freeze and unreviewed helper/ledger drift; inject failure after all DDL and prove complete rollback plus surviving committed freeze; observe no objects from another connection before the single success COMMIT; preserve existing OID/ACL/owner; retain freeze until contract; restore only seven community INSERT columns; deny native direct writes/closed admission; native confirmed/waitlisted and expired-deadline external/official community behavior; cancellation capacity release; re-freeze/restore exact ACL/unfreeze; and emergency rollback preserving protocol/cancellation while denying new admission. The original C1/C2 SQL/concurrency and real HTTP suite still runs unchanged before these tests.

Failure before the expansion commit leaves **only the separately committed freeze**. After commit, fail closed with separately authorized 03 and retain final security/locking objects; do not downgrade to old writers, restore raw native writes, DROP CASCADE or rewrite ledger rows. 06 alone cannot recover 03 or column revocation. A recovery bundle for emergency 03 needs separate review of exact ACLs/EXECUTE and freeze markers; none is authorized here.

Generate/check artifacts without executing SQL:

```text
node scripts/mission20-atomic-candidate.cjs --check
node --test scripts/test-mission20-release-package.cjs
```

Real qualification runs only through the existing native fixture infrastructure. Hosted Auth/gateway and actual backup/restore remain **BLOCKED**, regardless of green fixture CI. Independent review must approve the candidate, raw live body parity, complete dependencies, migration allocation, community pause, Vercel deployment hold, writer drain and rollback receipts before any operator execution.

## Observed qualified source

[GitHub run 41327981723](https://github.com/yashshah1211/HackerMate_Backup/actions/runs/41327981723) at `e5667889b62baa11a05a9504d0795fc3f00b58c7` reports both jobs successful: 1,620 application/package tests, TypeScript/scoped lint/build, 32 Rack checks, 51 SDK/writer tests, 279 SQL assertions per original variant and 100 orchestration checks. The added atomic fixture passed all 12 groups plus 231 original privacy assertions on PG17.6; both owned clusters were cleaned. The 15 real HTTP groups remain fixture acceptance, not hosted Auth. Three development failures and their exact corrections remain in ACCEPTANCE-EVIDENCE.json; none is hidden as an expected failure. Final current-head reporting-only CI is recorded in PR #96. Production execution remains NO-GO.
