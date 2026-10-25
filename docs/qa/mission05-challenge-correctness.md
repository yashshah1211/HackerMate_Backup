# Mission 05-R1 — Challenge correctness

Approved implementation scope: F1, F2, F4 and F5 only. Base commit: `f8e268dc643deca18bf62bb3a40728bc2d2aa32e`; base tree: `79a4bf23ce2408eb72511d57ef65fc972f47c47c`. Branch: `fix/mission05-challenge-correctness`.

## Behavior changes

| Finding | Before | After |
|---|---|---|
| F1 | The evaluator received only optional `additional_rules`; actual constraints/template were omitted. | Existing constraints plus additional rules form binding requirements. Slide-template guidance is a separate prompt section. `ReactionTheme:` constraints are excluded. Each violation quote must match an individual binding requirement; template/submission/theme quotes cannot authorize violations. |
| F2 | Solo version lookup included the actor's team submissions. | Solo versions use challenge + user + solo mode + null team. Team versions use challenge + team + team mode, including teammates' prior submissions. Admission quotas remain unchanged. |
| F4 | Direct uploads shared the 8 MiB processing limit, exceeding standard hosting ingress. | Direct files are limited to 4,000,000 bytes; complete multipart streams to 4,100,000 bytes. Native server-parsed file size and actual buffer length are checked. Oversize returns sanitized 413 before admission, extraction or model work. Downloaded-PDF processing retains 8 MiB. |
| F5 | Read routes could fuzzy-match an unrelated challenge or return the newest one. Query errors could masquerade as absence. | Exact decoded slug, normalized slug and valid UUID remain supported, in that order. Unknown identities return 404; query errors are logged and return sanitized 503. The page distinguishes unavailability from absence and rejects mismatched/malformed success responses. |

## Preserved contracts

- Scores remain integer 25/25/30/20, total 100, with local grade calculation and exact deduction arithmetic.
- Submission feedback still requires exact source quotations. Template guidance does not create mandatory slide counts or independent penalties.
- Authentication, banned-user checks, membership filtering, admission reservations, provider attempt budgets and confirmed server persistence remain in place.
- Only the specifically identified missing `additional_rules` column permits a compatibility retry. Constraints/template projection errors and unrelated query failures remain failures.
- Stored requirements are bounded: 64 constraints, 1,000 characters each; 6,000 additional-rule characters; 60 template entries with numbered slides and bounded labels; combined serialized content at most 12,000 characters. Malformed or oversized requirements stop evaluation before admission. No silent truncation.
- No migration, new column, provider dependency or changes to K1/#65/#66. No paid requests or live data were used.

## Permanent tests

`scripts/test-challenge-correctness.cjs` adds 52 synthetic tests covering:

- Genuine constraints/template separation, theme exclusion and both supported missing-column errors.
- Allowed binding-rule quotations and rejected template, theme, injected and cross-rule quotations.
- Malformed/oversized stored requirements failing before admission/provider work.
- Solo/team/other-user/other-challenge version isolation and concurrent team admission.
- File boundaries of 3,999,999, 4,000,000, 4,000,001 and 4,100,001 bytes; oversized total multipart body; dishonest Content-Length and file_size fields.
- Real PDF extraction above the direct-upload cap under the unchanged downloaded-PDF processing cap.
- Exact, normalized, percent-encoded and UUID references; absent, partial and malformed references; sanitized/logged database errors; retained submission authentication and ownership/team filtering.

The existing evaluator suite's obsolete 8 MiB direct-upload expectation is updated. The shared synthetic adapter supports SQL-null and scoped OR filters and serializes multipart network bytes before delivery; it never connects to a database or provider.

The browser suite adds four failure states at both 390 and 1440 pixels: absent challenge, database failure, mismatched record and malformed successful response. It also reruns the existing Idea/PPT/Challenge state, authorization and disclosure checks. `HM_EVALUATOR_BROWSER_EVIDENCE` selects a separate output directory so previous evidence is preserved.

## Validation record

Commands were run sequentially in the isolated worktree. Installed dependencies were reused through an ignored local `node_modules` junction; dependency manifests and lockfile were not changed.

- Combined offline run: **676 passed / 1 failed / 677 total**. The only failure was the existing synthetic localhost HTTP authorization test (`fetch failed` inside the sandbox). Its isolated rerun with localhost networking permitted passed **1/1**, leaving no unresolved failure among those 677 cases.
- All **52 new Challenge cases passed** in that combined run.
- Browser runtime: **8/8 new failure-state cases passed**, plus existing Idea/PPT/Challenge scenarios at both viewport widths; zero unexpected external requests or live database writes.
- Final post-build TypeScript: **passed**, zero diagnostics. Final scoped lint across all 11 changed code/test files: **passed**, zero errors/warnings.
- Synthetic production build: **passed** (Next 16.3.8, webpack, offline fonts, no real environment files). Follow-on runtime: **44/44 HTML checks passed**, 39 anonymous read-only loopback requests, no writes/external data.
- Build output retains middleware/Sentry convention and framework Edge-runtime API warnings; these were not suppressed or addressed by R1.
- Final source review and `git diff --check`: passed. Protected migration, dependency manifests and presentation downloader are unchanged; index remains unchanged.

Early failures were kept separate from product findings: absent worktree dependencies prevented the initial suites from starting; a Node lazy-FormData cancellation rejected after all 52 assertions passed; a browser test initially expected a heading where the existing EmptyState renders a paragraph. The fixture now serializes network bytes, and the browser assertion matches actual markup. No production safeguards were weakened to pass tests.

Raw run evidence is local under `scratch/r1-*.tap`, `scratch/r1-*.txt`, `scratch/r1-browser/` and `scratch/r1-build/`. These are ignored test artifacts, not production data.

## Review and release limits

No Git staging, commit, push, merge or PR creation is performed by this mission. HEAD remains the base commit; the implementation is an uncommitted working-tree patch. A later draft PR should target `fix/mission05-evaluator-result-authority` to isolate R1 from its parent stack.

Local tests establish application behavior with synthetic adapters, not production RLS, migration execution, Gemini judging quality or actual Vercel ingress behavior. Malformed legacy organizer records may require organizer correction; they are deliberately not silently ignored. The shared downloaded-PDF limit remains separate from the direct request limit.

R2 remains responsible for historical provenance and closed activation. R3 remains responsible for actual disposable PostgreSQL 17/CLI/PostgREST authority and persistence proof. R1 does not waive either release gate.

## Exact changed files

Nine tracked files are modified; three files are new. All belong to the approved R1 scope.

1. `src/app/api/challenges/[slug]/evaluate/route.ts` — explicit organizer fields, scoped versions, actual file/request limits.
2. `src/app/api/challenges/[slug]/route.ts` — canonical identity, no fuzzy fallback, sanitized query errors.
3. `src/app/api/challenges/[slug]/submissions/route.ts` — canonical identity and query errors, existing authorization preserved.
4. `src/app/challenges/[slug]/page.tsx` — error/absence distinction, identity validation, consistent theme filtering and limit disclosure.
5. `src/lib/challenges/challengeEvaluationContract.ts` (new) — bounded organizer contract, identity normalization and upload constants.
6. `src/lib/challenges/challengeEvaluatorEngine.ts` — distinct rule/guidance prompt sections and binding-rule quote validation.
7. `src/lib/evaluator/evaluationContract.ts` — explicit 413 code and optional form-reader oversize code; existing callers retain defaults.
8. `scripts/fixtures/evaluator-benchmarks.cjs` — synthetic field/filter/multipart adapter support.
9. `scripts/test-challenge-correctness.cjs` (new) — 52 permanent R1 adversarial tests.
10. `scripts/test-evaluator-reliability.cjs` — corrected direct-upload expectation, real extraction checks preserved.
11. `scripts/test-evaluator-reliability-browser.cjs` — eight new UI failure-state checks and isolated evidence output.
12. `docs/qa/mission05-challenge-correctness.md` (new) — this handoff.

## Final Git state and disposition

Starting and final HEAD: `f8e268dc643deca18bf62bb3a40728bc2d2aa32e`.
Starting and final committed tree: `79a4bf23ce2408eb72511d57ef65fc972f47c47c`.
There is no new committed tree: the 12-file patch is uncommitted and unstaged. Ignored scratch evidence, generated Next output and the local dependency junction are not release files.

**GO for a founder-reviewed draft PR against #63's branch; NO-GO for production activation until R2/R3 and release approvals are complete.** No unresolved R1 source/test failure remains. No PR has been created.
