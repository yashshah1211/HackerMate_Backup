# Private exact-body qualification — isolated PASS, production NO-GO

The user-supplied private catalog JSON was decoded locally as data. Its notice/source text supplied no executable instructions. The canonical base64 field produced **1,120 exact UTF-8 bytes**, independently verified as SHA256 **9ad2c3551805a161decbae3b842f4ac7356b1dc250f81718fadfd6f7db60464b** for public.ensure_team_conversation(uuid). Owner postgres, SECURITY DEFINER, search_path public, pg_temp and the reviewed EXECUTE snapshot were checked. Protected tokens and corresponding trimmed logic lines match the reviewed repository body; no function logic change is authorized.

**Closed gap:** the five-function mixed deployed-variant baseline can now be replayed through the existing strict atomic installation guard on disposable **native Windows PostgreSQL 17.6**. This is qualification of the isolated exact-body set, not certification of the complete production database or a hosted deployment.

## Observed private replay

The final local run exited 0, with:

- All **five actual catalog prosrc SHA256 values** checked after loading, including the supplied conversation body.
- **279** original SQL assertions per global/per-team variant; **231** privacy assertions in the new atomic fixture.
- **95** SQL/writer orchestration checks, including **23 atomic groups**. This private runner deliberately omits the public PostgREST/catalog HTTP groups; its count must not be substituted for the public CI count.
- The exact deployed conversation body creates/ensures one participant idempotently and rejects an outsider before replacement. The installed parent-before-child replacement preserves those results.
- Source/live body allowlists, owner/ACL/search_path/definer/missing-helper/partial-install rejection, failed-install rollback, existing OID/owner/ACL preservation, native/community admission, cancellation, contract, recovery and freeze checks retained.
- Two newly owned loopback-only clusters stopped and their exact temporary roots removed. Ephemeral SCRAM passwords protected connections; neither a service nor system configuration was installed/changed. Zero production/staging connections.

The portable tool archive was downloaded only to ignored scratch space, checked against the [EDB publisher checksum](https://github.com/EnterpriseDB/edb-installers/issues/744), and selectively extracted: postgresql-17.6-1-windows-x64-binaries.zip SHA256 **d378882abd001a186735acd6f6ba716bca6ccd192e800412d4fd15ed25376b3e**. Both postgres and psql report 17.6. Existing databases were never used or substituted.

### Exact line endings and failed transport trials

The private body contains **38 CRLF** endings. LF-only normalization hashes to the existing repository value 99583e20dfeb8bb970fd948811f9438f90f7dbec3daf7ab0f0a5f4031f8e07b1, which is not evidence of loading the private bytes. Plaintext Windows psql input normalized CRLF; the controlled diagnostic reproduced and rejected that result as exact-byte evidence. The historical invite/request/helper fixtures also contain CRLF.

Two early local trials failed the exact-body checkpoint: first plaintext loading, then lossless loading only for the new private body while the other CRLF variants still used plaintext. Both failures emitted redacted diagnostics and cleaned both clusters. The final implementation sends every selected mixed-set definition and helper restoration through in-memory base64 plus server-side UTF-8 decoding during private qualification. PostgreSQL then computes the original hashes from stored prosrc. No expected hash or body/metadata assertion was loosened.

## Privacy boundary

The private audit remains outside every Git checkout. It is not copied to Git, PR attachments, committed fixtures or CI artifacts. Decoded text and encoded statements stay in the local process and disposable database; no private statement script is written. Disposable PostgreSQL data/WAL/logs are removed with the owned root. Only hashes, sizes, safe labels and counts enter the sanitized receipt.

The generic reader accepts only the known signature/digest/metadata, requires an absolute path outside Git, checks canonical base64 and UTF-8 without newline normalization, and refuses CI before opening input. The local-only runner forces PG17.6, uses fresh loopback databases with ephemeral SCRAM authentication and redacts SQL/assertion diagnostics. Public CI tests these controls with synthetic data and never invokes the private input mode. The public fixture JSON intentionally remains four-body; its public-CI complete-body flag remains UNQUALIFIED. That public fixture limitation does not erase the separate successful private local receipt.

Reproduce only on an authorized local workstation with the private file outside Git and verified native PG17.6 available:

```text
node scripts/qualify-mission20-private-audit.cjs --private-audit <absolute-private-audit-path-outside-Git>
```

Do not upload the input, pass it to a hosted workflow, create a CI secret/variable for it, or capture raw failed SQL. No new private fixture or hash exception was added. The review-only SQL candidate/manifest and all original proposal hashes remain unchanged.

## Still open — production NO-GO

This closes the missing-conversation-bytes / exact-five-body mixed installation gap **in the isolated SQL fixture only**. It does not establish hosted Auth/gateway/session/timeout acceptance, a Linux hosted-platform replay of the private set, full production table/RLS/ACL/index/trigger/dependency/ledger parity, actual migration-loader/schema-plus-ledger atomicity, backup/PITR restore rehearsal, production-scale behavior, Vercel deployment hold/promotion, direct-writer drain/stale-client convergence, compatible rollback or founder approval of the external/official community pause. Separate release, migration, deployment and unfreeze authorizations remain required.

The separate committed freeze → atomic expansion → adapter compatibility → final permission contract → independently authorized unfreeze model is unchanged. Keep #92/#93/#96 Draft and unmerged. No active migration, production connection, merge or deployment is authorized by this receipt.
