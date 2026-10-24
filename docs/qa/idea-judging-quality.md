# Mission 05Q — local Idea judging improvements

Date: October 24, 2026 (IST). Base: `f8e268dc643deca18bf62bb3a40728bc2d2aa32e` (approved Mission 05 PR #63). Scope: Idea judging instructions, synthetic fixtures, focused offline regression tests and this report. No live model evaluation is authorized or performed.

## Design and decisions

The mission brief authorizes implementation of rubric calibration, fairness, actionable feedback and an offline benchmark. The working assumptions are student hackathon proposals, the existing four-category caps, unchanged request volumes/timeouts and existing security/privacy behavior. No new storage, infrastructure, ownership or maintenance service is needed. No unresolved product decision blocks these local changes.

Chosen approach: add an Idea-only instruction helper and inject only the selected track's criterion guidance into the existing prompt. Alternatives were changing the shared profiles (which also feed PPT) or postprocessing scores with local heuristics. Those would broaden scope or substitute another scorer, so neither was used. Custom criteria receive common evidence guidance, with no default domain criteria. This preserves organizer meaning without guessing criteria from keywords.

`idea-quality-2026-10-24` identifies the instruction revision inside the prompt and benchmark manifest. The existing `idea-v1` rubric version remains because caps, labels, schema and history contracts are unchanged. Comparing records by `rubricVersion` alone will not distinguish old and revised instructions; preserve the prompt revision and source SHA in any later experiment records. There is no history migration or metadata-contract change.

## Files changed

| File | Purpose |
| --- | --- |
| `src/lib/evaluator/ideaJudgingGuidance.ts` | New evidence bands, 12 track-specific criterion descriptions, custom-rubric guidance, fairness and feedback instructions |
| `src/lib/evaluator/trackEvaluatorEngine.ts` | Inject selected guidance; stop imposing generic domain criteria on custom rubrics |
| `scripts/fixtures/idea-quality-benchmarks.cjs` | 24 submissions, per-case expected principles, 19 criterion-level relative expectations |
| `scripts/fixtures/evaluator-benchmarks.cjs` | Export new suite alongside the existing unchanged 60 contract cases |
| `scripts/idea-quality-benchmark.cjs` | Node-only manifest validation and deterministic review-plan generation; no provider runner |
| `scripts/test-idea-quality-benchmark.cjs` | 17 infrastructure tests, including malformed-manifest rejection |
| `scripts/test-evaluator-reliability.cjs` | 26 new prompt/schema/dispatch tests using explicitly canned responses |
| `docs/qa/idea-judging-quality.md` | Design decisions, validation evidence, risks and proposed live protocol |

`evaluatorTypes.ts` and `evaluationContract.ts` were inspected and remain unchanged. No PPT or Challenge implementation changes.

## Scoring instructions

Each category is judged independently against its original maximum. Evidence bands guide the model; they are not a local score formula or enforced score validator:

| Fraction of category cap | Evidence anchor |
| --- | --- |
| 0–24% | Unsupported assertion, absent relevant support or unexplained mechanism; zero is valid |
| 25–49% | Plausible idea, limited criterion-relevant detail, important unexplained assumptions |
| 50–79% | Well-specified proposal, coherent reasoning, tradeoffs and feasible validation plan |
| 80–100% | Meaningful criterion-relevant validation with method/scope/results/limitations, or strong directly assessable evidence such as communication |

An untested design can earn proposal credit without being treated as validated software. Communication is assessed from the text itself and does not require an experiment. Self-reported pilot numbers remain unverified even when their described methods are useful. Unsupported accuracy/impact numbers earn no additional validation credit and do not automatically erase unrelated design merit. Missing evidence is not proof of dishonesty.

Web guidance covers problem/workflow fit, necessary components/trust boundaries, accessible interaction and recovery, and realistic delivery/growth. AI guidance covers task and baseline, appropriate data/model flow, task-specific failures and latency, and meaningful quality/cost methods. Generic guidance covers problem/mechanism, buildability, impact/adoption and understandable communication. Custom guidance follows the four actual organizer labels in order, regardless of the internal score-key names.

No bonus for buzzwords, repetition, complex technology or larger unsupported numbers. No penalty for appropriate simplicity, valid non-AI ideas, unfetched optional links, absent non-required deployment, or writing style carrying equivalent information. Missing information matters only to the relevant criterion. RAG, agents, databases, servers and expensive infrastructure are optional unless the task/rubric actually needs them.

Feedback must explain what an exact quote supports, the remaining gap or uncertainty, and why the score fits. Suggestions and risks are ordered by likely rubric improvement; each suggestion identifies a gap, feasible next action and a success check. Plain language, a few useful actions, empty strengths and empty role recommendations are allowed. Role recommendations require a demonstrated work gap. All existing quote matching and strict output-validation requirements remain active; matching a quote does not prove feedback semantics.

### Before/after examples

These are instruction examples, not observed model responses or measured scoring improvements.

| Before | Added/revised instruction |
| --- | --- |
| “Require concrete evidence for awarded credit and explain missing information proportionately.” | Four evidence bands; e.g. “A stack list is weak; a coherent flow with justified choices earns proposed-solution credit; described tests of that flow and its risks strengthen validation.” |
| “Submitted metrics are claims, not independently verified outcomes.” | Distinguish an assertion, proposed design, planned test and reported observation. Reward the quality of a described method, never claim independent verification, and never equate a larger percentage with stronger evidence. |
| “Give actionable next steps.” | Order suggestions by likely rubric improvement; identify the gap, one feasible action and how the student could check success. Explain each category's score with support and remaining gaps. |
| Custom track also received “Use domain-neutral problem clarity, feasibility, impact and communication criteria.” | “Judge only the supported organizer categories below. The internal score keys do not define the meaning of a custom criterion.” |

## Benchmark cases and expectations

All descriptions and pilot observations are fictional synthetic data. “High effort” and “low effort” are coverage tags, not scoring factors; relevant information is what matters.

| Track | Case IDs | Coverage |
| --- | --- | --- |
| Web | `web-low`, `web-plausible`, `web-specified`, `web-validation` | Unsupported → plausible → specified → described small pilot, including a failure and limitations |
| Web | `web-buzzwords`, `web-paraphrase`, `web-padding`, `web-links` | Same project with slogans, informal wording, repetition or optional unfetched links |
| AI | `ai-low`, `ai-specified`, `ai-validation` | Unsupported accuracy claim; useful classifier without RAG; incident-separated held-out pilot with baseline and limitations |
| AI | `ai-unverified`, `ai-complex`, `ai-injection` | Unsupported impressive metrics; unjustified infrastructure; schema/score/verification instruction attack appended to the same classifier |
| Generic | `generic-low`, `generic-specified`, `generic-validation` | Goal alone versus a coherent mechanical, non-AI design versus described bench observations |
| Generic | `generic-paraphrase`, `generic-optional` | Equivalent hardware explanation and optional unfetched links |
| Custom | `custom-low`, `custom-specified`, `custom-validation`, `custom-paraphrase` | Accessibility, privacy minimization, offline recovery and communication; specific design, local test claims and equivalent wording |
| Custom | `custom-delivery-rubric` | Same source under milestones/resources/risks/validation criteria; must follow changed labels, with no arbitrary cross-rubric score ranking |

The manifest records **19** expectations with explicit category keys and reasons: 7 Web, 5 AI, 4 generic and 3 custom. They use `higher`, `equivalent` or `not_lower`, never invented exact target scores. Evidence additions are compared only in supported categories, avoiding a halo effect. Equivalent variants should remain close; unsupported claims and unnecessary complexity must not improve scores. Embedded injection should leave project merit unchanged. The custom-rubric switch has per-case semantic expectations rather than comparing different rubric totals.

### Three different kinds of evidence

1. **Deterministic prompt/schema/contracts:** run the actual engine and provider adapter inside the existing VM harness with fake credentials and explicit mocked fetch. Check original caps, integer schema, required exact quotes, local totals/grades, selected track/custom guidance, unchanged pinned model/options, JSON-encoded submission and identical prompt/schema for optional URLs. The new 24-case dispatch matrix intentionally returns the same canned scores; it does not test rankings. Existing regressions retain invalid-output, evidence, deadline, provider-budget, authentication, quota and persistence checks using in-memory adapters.
2. **Benchmark infrastructure:** validate IDs, references, track/custom-rubric compatibility, coverage, size limits and bounded repetition counts. A deterministic plan keeps all expectations `unmeasured` and `liveQualityMeasured: false`. It has no API, database, environment-file or credential loading. `node scripts/idea-quality-benchmark.cjs` only prints this plan.
3. **Real-model quality properties:** evidence-sensitive ranking, calibrated score bands, wording/buzzword/length invariance, appropriate-architecture fairness, semantic truth of feedback, action prioritization and actual injection resistance all require real model outputs and human review. None were measured here. Contract rejection of a fabricated quote does not prove the real model would resist an attack.

## Local verification

Dependencies were absent in this worktree. The already installed `../trusted-idea-evaluation/node_modules` was reused through a local junction: both package-lock files have SHA256 `6FD6919813DA734EBC123FA5E3EE80C5085172FD5DC42EB1920578CFD7E6BF83`, with Next.js 16.3.8, TypeScript 5.9.3 and ESLint 9.39.4. No packages were installed, and no manifest or lockfile was modified. The temporary junction was removed after verification.

Final observed results are recorded below after execution. Commands are run from this worktree:

```powershell
node --test --test-isolation=none scripts/test-evaluator-reliability.cjs scripts/test-idea-quality-benchmark.cjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js src/lib/evaluator/trackEvaluatorEngine.ts src/lib/evaluator/ideaJudgingGuidance.ts scripts/fixtures/evaluator-benchmarks.cjs scripts/fixtures/idea-quality-benchmarks.cjs scripts/idea-quality-benchmark.cjs scripts/test-idea-quality-benchmark.cjs scripts/test-evaluator-reliability.cjs
```

- Final combined offline run: **397/397 passed**, zero failures, cancellations, skips or todos; observed duration **57,279.5369 ms**. This comprises 354 existing regressions, 26 new prompt/schema/contract checks and 17 benchmark-infrastructure checks. All provider responses and database-shaped operations were mocked. The existing 60 contract fixtures remain separate from the 24 new quality-review inputs.
- TypeScript: **passed**, no diagnostics, using `--noEmit --incremental false`.
- Scoped ESLint on the seven changed executable files: **passed**, no errors or warnings.
- `git diff --check`: **passed**.
- Review-plan CLI: observed 24 cases, 19 expectations, 48 planned executions and a 96-provider-attempt ceiling for its default two repetitions; `liveQualityMeasured: false`. This generated no requests.
- First combined test run exposed two newly written test-fixture mistakes: an 18-point canned response exceeded the Web track's 15-point cap, and an unrelated classifier quote failed grounding in the custom map test. They were reproduced and corrected in tests only; the focused rerun passed 2/2 and the subsequent complete run passed 397/397. The strict score and quote validators were not relaxed.

Raw local test/lint logs are in ignored `scratch/idea-quality-tests.log` and `scratch/idea-quality-lint.log`; the typecheck log is `scratch/idea-quality-typecheck.log` (empty on success). This report records observed results rather than reusing historical Mission 05 counts.

## Compatibility and remaining risks

The response schema, numeric caps, grade thresholds, history format, provider model pins, temperature, output ceiling, execution budgets, authentication, quotas, provenance validation, persistence and error paths are unchanged. The active engine still rejects forced heuristic mode and requires a validated AI response. Shared track profiles and dormant legacy heuristic helpers were not edited or reactivated.

The longer prompt could increase input cost/latency or compete with output completeness under the existing limits; offline tests do not establish provider acceptance or latency. Bands are model instructions, not proof of calibration, and can introduce thresholds/anchoring. Novelty and broad organizer labels remain subjective. Models can still mistake self-reported evidence for truth, assign uneven scores to equivalent text, or produce misleading prose attached to a valid quote. Custom labels are bounded by the existing supported format; their interpretation is still a model judgment. This synthetic sample is small and not an unbiased estimate of performance on real student work. Real model quality, repeatability, prompt-injection robustness and feedback usefulness remain unverified.

## Proposed live-Gemini protocol — separate approval required

No live runner is added or run in this phase. A small follow-up experiment could use these eight non-private synthetic inputs: `web-specified`, `web-buzzwords`, `ai-specified`, `ai-validation`, `ai-unverified`, `ai-injection`, `generic-specified`, `custom-delivery-rubric`. This is a smoke comparison, not coverage of the full suite or all quality claims.

Freeze the approved baseline and revised prompt text, source SHA, instruction revision, model pins, caps/schema, temperature 0.1 and 3,500-output-token ceiling. Use each input twice under each prompt: **8 × 2 × 2 = 32 evaluator executions**, nominally **32 provider requests**, at most **64 provider attempts** under the unchanged two-attempt ceiling. Do not add retries for malformed JSON, quota rejection or poor scores. Stop on quota/billing/provider-access rejection. Record failures instead of replacing them with successful runs. Separate primary-model and fallback-model outputs; never silently pool them as a prompt effect. Use direct evaluator calls in an isolated approved experiment with no database, user history or application quota mutation.

Before execution, obtain explicit approval for the inputs, 64-attempt ceiling, account/model availability and a monetary spend ceiling using that account's current rates. No entitlement or free quota is assumed from model names. The 64 attempts allow up to **224,000 generated tokens** at the existing output ceiling; input usage depends on serialized prompt lengths (rough planning estimate: 2,000–4,000 input tokens per attempt for this subset, or 128,000–256,000 across 64 attempts; verify with provider usage, not this character-based estimate). Estimated cost is the sum across actual models of `(input tokens × input price + output tokens × output price) / 1,000,000`, including separately priced thinking/cached tokens if applicable. No dollar estimate is reliable without current model/account rates; no price or billing API was called. Count retries toward both request and spend ceilings; stop before the next request if the conservative remaining cost exceeds the approved budget. Existing request limits alone do not enforce a monetary cap.

Pre-register a comparison policy before seeing outputs: `higher` means a higher repeat-mean score in each listed category; `not_lower` permits at most 5% of the category cap lower; `equivalent` permits at most 5% of the cap difference in repeat means. These are provisional operational tolerances, not ground-truth labels or validated thresholds. Report individual scores and paired differences so a pass/fail cutoff cannot conceal variation. Two repeats support only a small smoke check, not statistical confidence.

Randomize run order with a fixed seed and blind human reviewers to prompt variant. Have two reviewers inspect criterion-relevant support, claim qualification, custom labels, actionable prioritized feedback, score proportionality and injection compliance. Review full quoted feedback for semantic grounding, not just quote presence. Report disagreements and contract failures, both repeats and within-case spread, relative expectation violations, usage/cost/attempts and latency. Do not declare success from schema compliance or a small average total increase. A larger approved benchmark is needed before claims of consistent fairness or calibrated accuracy.

Stopped after local changes and tests. No Gemini calls, database access/SQL execution, secret retrieval, Vercel operations, package changes, Git writes, PR changes or deployment were performed.
