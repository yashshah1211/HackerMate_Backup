# Phase B metadata regression correction

**Approved correction implemented on PR #92 in e2e3643fae9643f92d91cc0e271955449536054a**, separate from C2 adapters. Only the three outdated expected literals changed; all original strict assertions and rendering source remain intact. Five new strict cases explicitly cover inline punctuation, unknown entities, terminal legacy entities, numeric entities and prevention of double decoding. No workflow is called green without its completed GitHub result.

## Exact source and cause

`src/lib/hackathons/publicMetadata.ts:10` cleans Markdown, calls `plainEventText`, normalizes whitespace and produces plain strings for description, Open Graph and Twitter metadata. It has not changed since `9c857b27e6b1d335ee381831743696103acc16ee` (public previews, #35).

Mission 20 Phase B commit `a480b13822bf1c5134505e0b7b237af368c8a72d` changed `src/lib/hackathons/discovery.ts:30` from regex tag removal to `descriptionText` in `src/lib/hackathons/description.ts:62`. That uses `parseEventDescription` (`description.ts:41`) and parse5. The shared parser preserves inline text adjacency and decodes HTML entities once. The unchanged metadata tests still expect artifacts of the former regex implementation. Both metadata source and these tests are unchanged between reviewed C1, reviewed C2 source and this follow-up.

The same three failures reproduced on C1 `ac618ea003055c9c03495344234e32a1ed8dd07a` (26/29) and reviewed C2 `a7978690e25441025f3e54380e6c6d8ae9ef5604` (26/29). They are not caused by SDK adapters.

## Verified and adopted expected behavior

| Existing test / assertion | Old expected literal | Verified parser literal / adopted expectation | Reason |
| --- | --- | --- | --- |
| `scripts/test-public-hackathon-metadata.cjs:24`, approved metadata | `Build climate tools together .` | `Build climate tools together.` | Closing an inline `<b>` must not invent a space before punctuation. |
| `scripts/test-public-hackathon-metadata.cjs:78`, malformed formatting case; strict checks at line 87–88 | `Unclosed [link & bold &unknown; &amp` | `Unclosed [link & bold &unknown; &` | HTML text parsing decodes the terminal legacy named reference `&amp` without a semicolon. The unknown `&unknown;` stays literal. |
| `scripts/test-public-hackathon-metadata.cjs:81`, headings/numeric entities case; strict checks at line 87–88 | `Build C# & tools &#35; &#x3c;literal&#x3e;` | `Build C# & tools # <literal>` | Decode numeric references once while preserving the literal hash in `C#`; encoded angle brackets remain text, not a second HTML parse. |

The recommendation follows the approved Phase B description-fidelity behavior and existing `scripts/test-hackathon-description.cjs` entity/punctuation/source-order coverage. It is not a proposal to restore the old regex artifacts in shared rendering. Plain metadata strings must still be escaped by Next/React. Do not introduce raw HTML rendering or decode twice.

## Accepted correction and safe branch synchronization

The founder approved the faithful parser contract after independent review at fc6fec7. The test-only commit on PR #92 changes exactly those three literals, without renaming/deleting tests or weakening comparisons. A byte comparison of the original test source (normalizing CRLF) confirms it is preserved verbatim except for those three approved replacements; the five cases are appended. Every new case compares both the actual Phase B parser output and description/Open Graph/Twitter strings to an independent exact literal.

- Phase B (#92): **e2e3643fae9643f92d91cc0e271955449536054a**, one file: scripts/test-public-hackathon-metadata.cjs.
- C1 (#93): **541ed465e7acfbbc0aa258d7712b97b6238d27ab**, merge commit with parents ac618ea and e2e3643; only the inherited metadata test changes relative to its former head.
- C2 (#96): **850784d5a39d64b8cbf9e5f742fc8936365f101f**, merge commit with parents fc6fec7 and 541ed46; same inherited correction, preserving all SDK/adapter work.

No force push, discarded work or PR merge was used. The metadata correction lives in Phase B and is inherited through the stack; it is not a C2 adapter change. C2's accompanying commit updates documentation and the CI regression-step label only. Exact current-head Actions results and job links are recorded in the PR bodies after qualification; historical red runs in VERIFICATION.json and REVIEW-FOLLOWUP.md are retained as history, not current failures.

Local parser verification confirmed all three adopted outputs directly on Phase B before changing expectations. The corrected metadata suite has **34 cases**, and metadata plus description fidelity passed **41/41**. C1 design plus corrected metadata passed **50/50**. TypeScript and scoped lint passed. The broad selection and guarded build/Rack/PG17 qualifications are reconciled against their actual runs before a green claim.

Application rendering, public visibility/canonical/noindex policy, hostile-text and decode-once tests, active/review-only SQL, privileges/RLS, environment and dependencies are unchanged. The complete freeze-first release, independent SQL/code review, deployed parity and isolated Auth/PostgREST acceptance gates remain required. No production/staging connection, migration, deployment, live registration or data write. All three PRs remain Draft and unmerged.
