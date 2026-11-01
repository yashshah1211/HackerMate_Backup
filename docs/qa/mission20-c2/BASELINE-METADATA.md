# Separate baseline correction: public metadata expectations

This is an actionable baseline correction specification, separate from the C2 writer/authentication follow-up. **The three existing assertions and all rendering source remain unchanged in this follow-up.** They continue to fail visibly; no green application/workflow claim is made.

## Exact source and cause

`src/lib/hackathons/publicMetadata.ts:10` cleans Markdown, calls `plainEventText`, normalizes whitespace and produces plain strings for description, Open Graph and Twitter metadata. It has not changed since `9c857b27e6b1d335ee381831743696103acc16ee` (public previews, #35).

Mission 20 Phase B commit `a480b13822bf1c5134505e0b7b237af368c8a72d` changed `src/lib/hackathons/discovery.ts:30` from regex tag removal to `descriptionText` in `src/lib/hackathons/description.ts:62`. That uses `parseEventDescription` (`description.ts:41`) and parse5. The shared parser preserves inline text adjacency and decodes HTML entities once. The unchanged metadata tests still expect artifacts of the former regex implementation. Both metadata source and these tests are unchanged between reviewed C1, reviewed C2 source and this follow-up.

The same three failures reproduced on C1 `ac618ea003055c9c03495344234e32a1ed8dd07a` (26/29) and reviewed C2 `a7978690e25441025f3e54380e6c6d8ae9ef5604` (26/29). They are not caused by SDK adapters.

## Exact behavior to review for the separate correction

| Existing test / assertion | Old expected literal | Current literal / recommended faithful expectation | Reason |
| --- | --- | --- | --- |
| `scripts/test-public-hackathon-metadata.cjs:24`, approved metadata | `Build climate tools together .` | `Build climate tools together.` | Closing an inline `<b>` must not invent a space before punctuation. |
| `scripts/test-public-hackathon-metadata.cjs:78`, malformed formatting case; strict checks at line 87–88 | `Unclosed [link & bold &unknown; &amp` | `Unclosed [link & bold &unknown; &` | HTML text parsing decodes the terminal legacy named reference `&amp` without a semicolon. The unknown `&unknown;` stays literal. |
| `scripts/test-public-hackathon-metadata.cjs:81`, headings/numeric entities case; strict checks at line 87–88 | `Build C# & tools &#35; &#x3c;literal&#x3e;` | `Build C# & tools # <literal>` | Decode numeric references once while preserving the literal hash in `C#`; encoded angle brackets remain text, not a second HTML parse. |

The recommendation follows the approved Phase B description-fidelity behavior and existing `scripts/test-hackathon-description.cjs` entity/punctuation/source-order coverage. It is not a proposal to restore the old regex artifacts in shared rendering. Plain metadata strings must still be escaped by Next/React. Do not introduce raw HTML rendering or decode twice.

## Separately actionable correction

Review this metadata contract on its own diff against the Phase B baseline. If accepted, change only the three exact expected literals above and clarify the numeric-entity test name. Retain strict equality for description, Open Graph and Twitter, exact safe projection/visibility/canonical checks, all noindex/privacy failures, and the decode-once/hostile-text assertions. Add explicit strict checks for adjacent inline punctuation, terminal legacy entity, unknown entity preservation, literal numeric-reference characters and absence of double decoding. Do not delete cases, loosen them to substring/regex assertions, use snapshots that accept arbitrary output, or alter unrelated description rendering.

If product review instead requires literal entity spellings in metadata, define that as an explicit metadata-only contract and implement/test it separately; do not silently change shared `descriptionText`. Until the separate baseline correction is reviewed and applied, the three failures remain a visible application qualification blocker. No assertion update or rendering change is included in PR #96's authentication follow-up.
