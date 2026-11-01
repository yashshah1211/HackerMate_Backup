# PR #96 independent review follow-up

**Historical snapshot before the approved Phase B metadata correction.** The three metadata expectation failures documented here are now corrected by e2e3643 and safely inherited through the stack; see [BASELINE-METADATA.md](BASELINE-METADATA.md). All original authentication qualification evidence and limits below remain recorded.

Reviewed head: **a7978690e25441025f3e54380e6c6d8ae9ef5604**. SQL remains review-only; production/staging migration, rollout and deployment remain unauthorized. C1's freeze-first release/drain requirements are unchanged.

## Completed reviewed-head GitHub Actions verification

Run [41304144336](https://github.com/yashshah1211/HackerMate_Backup/actions/runs/41304144336) completed **failure**, not green.

| Job | Result | Evidence |
| --- | --- | --- |
| [native-pg17](https://github.com/yashshah1211/HackerMate_Backup/actions/runs/41304144336/job/124840982744) | **success** | Official checksum-pinned native PG17.6 build; 31 adapter cases passed; 279 baseline/security assertions per variant; 72 orchestration checks (21 global / 51 per-team); both fresh clusters cleaned. |
| [application](https://github.com/yashshah1211/HackerMate_Backup/actions/runs/41304144336/job/124840983083) | **failure** | Only the application-regression step failed: 1,585/1,588 passed, exactly the three baseline metadata cases. TypeScript, adapter/route lint, guarded production build and all 32 Rack browser checks passed; browser artifact uploaded. Build/browser recorded zero mutations and synthetic transport only. |

The historical evidence at e8a84ee is now supplemented by actual a797869 job results, not merely an assumption that documentation changes cannot affect CI. Subsequent follow-up-head Actions and their exact results are recorded in the PR #96 body and GitHub run; this document records the requested reviewed-head check and local follow-up evidence.

## Installed SDK and complete native HTTP path

New `scripts/test-mission20-native-http-sdk.cjs`: **20/20 passed** locally with the installed **@supabase/supabase-js 2.108.2 / auth-js 2.108.2**. No SDK, auth, preflight, writer or route function is mocked. The existing VM harness transpiles the real application modules; only `fetch` is replaced with an exhaustive in-memory Auth/PostgREST transport. Every request must use the reserved `.invalid` fixture origin and fake anonymous/bearer values. Unexpected requests and transport invariant violations fail the test even if the SDK catches the thrown exception. No actual socket, credential, service or database is used.

- A server client with `persistSession:false`, `autoRefreshToken:false` and an explicit global bearer header has a null session before and after `getUser()` and `getUser(token)`, yet authenticates through synthetic `/auth/v1/user`. A sessionless client without a bearer returns `AuthSessionMissingError` without transport; an explicit token argument authenticates. The installed SDK sets `hasCustomAuthorizationHeader` in `SupabaseClient.ts`, allowing the no-session custom-header path in `GoTrueClient._getUser`. This resolves the uncertainty without changing production code.
- Actual native `POST` → `registerNativeEvent` → `loadPublicEvent` → `writerRpc` → installed SDK RPC transport executes in order. The solo success trace is exactly Auth, own profile, public event, own registration, refreshed public event, Auth recheck, one RPC POST. Every request retains the explicit token. Profile/registration filters bind to the Auth-returned user, tested for two different users with misleading user metadata. RPC arguments contain no caller identity or caller-selected status.
- Missing/malformed bearer returns 401 before any transport. An invalid token or anonymous user returns 401 before database reads. Revocation or an identity mismatch on the pinned-token recheck returns 401 after preflight with **zero RPC mutations**. Caller-supplied user/status fields return 400 before any transport.
- Closed registration, closure during preflight, profile identity mismatch and unowned team block the mutation. Owner-inclusive legacy roster passes through the real installed SDK count headers and real preflight. Confirmed, waitlisted and already-registered RPC results survive the entire route unchanged. There is exactly one permitted mutation endpoint and no raw INSERT fallback.

This validates application/SDK HTTP construction and response handling. The in-memory Auth service does not prove JWT signature/session-revocation enforcement in a deployed Auth server; the synthetic PostgREST endpoint does not execute SQL/RLS. The separate native PG17.6 qualification tests actual database functions and concurrency. Approved isolated end-to-end Auth/PostgREST/database acceptance and production parity remain release gates; no live acceptance is implied.

## Local verification and separate baseline failures

Commands:

```powershell
node --test scripts/test-mission20-native-http-sdk.cjs
node --test scripts/test-mission20-native-http-sdk.cjs scripts/test-mission20-c2-writers.cjs scripts/test-native-registration.cjs scripts/test-public-hackathon-metadata.cjs scripts/test-hackathon-description.cjs
npm run typecheck
```

Results: **20/20** new SDK transport tests; **110/113** combined tests, with only the same three metadata failures; TypeScript passed. Existing 31 C2 writer cases, native registration and description fidelity assertions remain intact. [BASELINE-METADATA.md](BASELINE-METADATA.md) identifies the exact introducing source, three old/current literals, intended behavior and separately reviewable correction. This follow-up changes neither metadata assertions nor application rendering.

Full modified-source lint plus the new test: **17 existing errors / 7 existing warnings**, identical to C1 by file/rule/severity/source/message fingerprint. **New C2/follow-up diagnostics: zero.** New test lint passed.

| Existing file | Errors | Warnings |
| --- | ---: | ---: |
| `src/app/admin/_tabs/TeamsTab.tsx` | 0 | 1 |
| `src/app/dashboard/useDashboardData.ts` | 1 | 0 |
| `src/app/hackathons/[id]/page.tsx` | 5 | 5 |
| `src/components/TeamWorkspaceView.tsx` | 10 | 1 |
| `src/components/chatThread.tsx` | 1 | 0 |

## Exact follow-up inventory (six paths)

1. `.github/workflows/mission20-c2-qualification.yml` — run the new installed-SDK suite in application and PG17 jobs, and lint it.
2. `scripts/test-mission20-native-http-sdk.cjs` — 20 offline installed-SDK/full-route transport regressions.
3. `docs/qa/mission20-c2/REVIEW-FOLLOWUP.md` — reviewed-head job results, tests, bounds and lint reconciliation.
4. `docs/qa/mission20-c2/BASELINE-METADATA.md` — separate baseline correction specification; no assertions/renderers changed.
5. `docs/qa/mission20-c2/README.md` — point to the follow-up evidence.
6. `docs/qa/mission20-c2/VERIFICATION.json` — extend exact PR inventory and record reviewed-head/local follow-up results.

The complete C2 PR inventory is 38 paths. No application source, dependency, environment, active migration or review-only SQL changes in this follow-up. Keep #92, #93 and #96 Draft. No production/staging connection, registration, data write, deployment or merge. Remaining blockers: separate metadata contract correction, existing full-file lint debt, independent review and the already documented database/JWT/PostgREST/freeze-first release gates.
