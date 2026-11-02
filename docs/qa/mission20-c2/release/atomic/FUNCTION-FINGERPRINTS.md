# Exact function fingerprint reconciliation — review only

**Latest private qualification:** the supplied exact conversation body has now been SHA-verified and the five-body mixed set replayed successfully on disposable local native PG17.6. [Private qualification scope, counts and privacy controls](PRIVATE-QUALIFICATION.md). This closes that isolated raw-body replay gap only. Public CI intentionally still has four body fixtures and never receives the private input. Production remains NO-GO; broader platform/catalog/loader/restore/release gates remain open.

**Production release remains NO-GO. Public CI remains a four-body fixture replay; the separate private local PG17.6 exact-five-body replay is now PASS within its isolated scope.** Task baseline: `89cda40f270e73b6952c29336212a1c69856f4cc`. No production/staging connection or query was made. The founder independently supplied five raw SHA256 values and verified equivalent content after whitespace normalization and corresponding trimmed-line comparison, with no differing logic. PostgreSQL 17.6, postgres ownership, SECURITY DEFINER, search_path public, pg_temp and the hardened helper's non-client EXECUTE restrictions were also independently confirmed.

## Dedicated source/live evidence table

| Signature | Reviewed repository `prosrc` SHA256 | Independently supplied live `prosrc` SHA256 | Exact-byte fixture evidence |
| --- | --- | --- | --- |
| public.accept_team_invite(uuid) | ec636cb3bef80b67420d7967c3ac72c33017e550816b8257a16e956d4eb92cac | 5cda72e78872633f23754f53027b34cb0aa34feabfe6b9aaf44496eb484a2963 | Historical local audit bytes match the supplied digest; protected tokens and corresponding trimmed lines equal source. |
| public.accept_team_join_request(uuid) | e758a8ec46db28b3b1af658eeea8b31c8b533523f82c0998d3c227377d0c7217 | 20cbbea56deecc735f80e018978975912278a74557dac129b6acb7087ad4eaed | Same historical-byte/source proof. |
| public.ensure_team_conversation(uuid) | 99583e20dfeb8bb970fd948811f9438f90f7dbec3daf7ab0f0a5f4031f8e07b1 | 9ad2c3551805a161decbae3b842f4ac7356b1dc250f81718fadfd6f7db60464b | Supplied privately, SHA-verified and replayed successfully on local PG17.6. Kept outside Git/CI; no committed raw fixture. |
| public.delete_user_completely(uuid) | ea2036ee96a7fac12b49c330bc6d292716cd853763bd956be912a63981291cfe | ea2036ee96a7fac12b49c330bc6d292716cd853763bd956be912a63981291cfe | Same raw body; source/deployed hashes deduplicate to one accepted value. Historical local audit bytes also match. |
| public.add_user_to_team(uuid,uuid,text) | 5b5c5ce785d0226bd86f6eb33749ed7af4fd4ddd563650c5735700099df508b4 | 11919942fa8c526386b3dbe5ada6c37e0fa8ca0198395b807d7c80780beda500 | Historical local audit bytes match; September 28 hardened member-only body, owner/self/capacity/duplicate/chat checks unchanged. Helper is never replaced/re-granted by the candidate. |

Source files are pinned per signature in [FUNCTION-FINGERPRINTS.review.json](FUNCTION-FINGERPRINTS.review.json). The exact local fixtures came from existing `mission02-live-functions-20261023.json` and `live-function-definitions.json` artifacts; their original file hashes/provenance and selected body bytes are recorded in [deployed-body-fixtures.review.json](deployed-body-fixtures.review.json). Only functions independently matched to already-reviewed public repository content are included. No full private catalog snapshot or new live data is published. These historical matches are not a replacement for a current private audit bundle.

## Proposed guard semantics

Each signature accepts **only its explicit source hash or independently verified live hash**: nine distinct signature/hash pairs in total, with deletion deduplicated. Runtime SQL hashes the actual `pg_proc.prosrc` bytes and compares exact set membership. It does not trim, normalize whitespace, remove comments, accept arbitrary formatting-equivalent code, change SHA256 behavior or trust a supplied digest instead of catalog bytes. An unknown whitespace-only third variant fails just as an unknown functional body does.

No functional change is authorized by the allowlist. Four available bodies are checked offline using both corresponding nonempty trimmed-line equality and tokens that preserve quoted literals/identifiers/dollar strings and token boundaries. The comparison is a review aid, never runtime admission logic. Conversation's exact private body is now independently hash-verified and replayed locally, with protected-token/trimmed-line checks. It is neither reconstructed nor committed. The separate private receipt closes the isolated five-body replay gap while public CI intentionally retains its four-body limitation.

Owner, definer and exact function search_path settings remain mandatory. A new read-only ACL gate checks the existing reviewed security envelope and **never changes existing grants**:

| Existing function group | Required/preserved EXECUTE envelope |
| --- | --- |
| Invite, join-request, ensure conversation | Owner postgres; authenticated required; existing service_role EXECUTE allowed but not required; no PUBLIC/anon, unknown grantee, non-owner grant option or unexpected grantor. Historical invite/request catalog snapshots explicitly included service_role. This is preservation, not a new production grant. Current full ACL/role-graph receipt remains a release gate. |
| Canonical deletion | Owner postgres and authenticated; no service_role/PUBLIC/anon or extra grant capability. |
| Hardened internal add-member helper | Owner only; no PUBLIC/anon/authenticated/service_role EXECUTE. |

Unexpected owner/config/definer/body/ACL state fails closed before replacement. Missing helper, an existing private namespace or a stray public native RPC cannot be silently overwritten. CREATE OR REPLACE still preserves legitimate existing OIDs/owners/ACLs. No table grant, RLS policy or original proposal is changed by this follow-up.

## Qualification labels

The existing PG17.6 runner retains all original SQL, concurrency, real PostgREST and application tests. Added atomic-fixture tests cover source-only acceptance with rollback, the actual emitted digest sets, all five unknown functional and whitespace-only bodies, ACL expansion/revocation/grant options/unknown role, owner changes, missing helper, altered search_path/definer, partial namespace/public RPC and an installed mixed bundle containing all four available exact deployed bodies. Public CI complete-body replay remains **UNQUALIFIED** because its fixtures intentionally exclude the private input. The private local exact-five-body replay is separately PASS; see PRIVATE-QUALIFICATION.md. A digest predicate test is not represented as raw-body installation.

The separate committed freeze → atomic expansion → adapter compatibility → permission contract → separately authorized unfreeze boundaries and source proposal hashes remain unchanged. No active migration versions are allocated. Future operator execution additionally requires full live schema/ACL/dependency/ledger parity, loader/schema-plus-ledger qualification, community-pause approval, verified Vercel hold/direct-writer drain, hosted Auth/gateway parity, actual backup/restore and independent release authority. Neither an allowlist proposal nor green isolated CI authorizes execution.

## Immutable qualification receipt

[Run 41332969866](https://github.com/yashshah1211/HackerMate_Backup/actions/runs/41332969866) at `1e1f91fe71911dd7ac2b04470ea63267d6cef823` completed SUCCESS for both jobs: 1,625 application/package tests, TypeScript/scoped lint/build, 32 Rack cases; PG17.6 with 51 SDK/writer tests, 279 SQL assertions per original variant, 231 additional privacy assertions, 108 orchestration checks including all 20 atomic groups and 15 real PostgREST HTTP groups. Both owned clusters were cleaned. All four available exact raw body fixtures passed SHA checks and the mixed-bundle install; complete deployed-body installation remains **UNQUALIFIED**.

The two failed development runs are retained in ACCEPTANCE-EVIDENCE.json with their common fixture-only dollar-quoting cause and callback fix/regression. No collision/body/ACL assertion was weakened. Final current-head reporting-only CI is recorded in PR #96. Green isolated CI does not remove the private-artifact or rollout gates.
