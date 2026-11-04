# Organizer description presentation

Approved by the workspace owner on 2026-11-04. Base: c0a7da5 (main, including PR #111).

Build a reusable event guide inside the existing About sections. Participants must be able to read organizer copy, find actions and inspect details without losing source information. Keep hero, registration, source evidence, community and partner behavior intact. No source parser, database or production mutations.

## Decisions and assumptions

- Preserve an ordered stream of source headings, paragraphs, lists and explicit facts. Do not group by content type or merge repeated headings. Prefer readable text when uncertain. This replaces the existing keyword-prefix parser that can remove sentences.
- Use existing typography and theme tokens, a comfortable reading width, section spacing and occasional warning emphasis. Avoid nested cards or a new design system.
- Decode entities using the small, free `entities` library (already present transitively; declare it directly). This avoids DOM-dependent output and incomplete hand-maintained entity maps. Render only React text and validated HTTP(S) anchors, never organizer HTML.
- Long, confidently secondary sections may use native keyboard-accessible details in their original positions. Keep introduction, registration, eligibility, deadlines, rules, warnings and ambiguous sections open. If any critical language occurs in secondary content, keep the entire section open. Prefer excess visibility to hiding an instruction.
- Processing is local and synchronous, with no network or model calls. No new service, user tracking or persisted state. Typical descriptions are kilobytes; test long and malformed content. Pure parsing makes maintenance and source-preservation tests straightforward.
- Capture the exact public NASA Raipur description read-only as a regression fixture. Other fixtures cover HTML, URLs, short/empty, malformed, Devfolio and native/partner inputs.

## Alternatives

Styling the existing parser would retain information loss. A Markdown-only renderer would improve supported Markdown but leave flattened Unstop copy unstructured. Choose conservative structural recognition plus plain-text fallback, with independent parsing and rendering tests.

## Verification and delivery

Run TypeScript, lint, offline parser/source/partner regressions and browser suites. Exercise actual authenticated/public page components using offline transport; deny real writes/network. Check 390/768/1440px, both themes, keyboard disclosure, source fidelity, URL safety and unchanged event actions. Save actual screenshots, results, limitations and GO/NO-GO guidance. Leave all changes unstaged; owner performs explicit staging, commit and push before a Draft PR can be opened. Do not merge or deploy.

## One-time Git authorization

The owner subsequently authorized task-specific staging, commit, push and a Draft PR on `feat/hackathon-description-guide`. AGENTS.md and the permanent manual-only rule remain unchanged. The additional proposed CI workflow is excluded from this PR because the authorization explicitly prohibits workflow changes. Existing qualification workflows are used as-is. No merge, deployment, production mutation, force push or infrastructure change is authorized.
