# Pitch deck evaluation: native PDF vision

Phase 2 extends the team evaluator without a schema migration. Work was implemented on `develop`; production, remote branches and Supabase were not changed.

## Flow and decisions

1. The authenticated team API validates the existing Google/Canva link allowlist.
2. Google Slides exports are requested as PDFs first. Drive files are downloaded, with a Slides PDF export attempt for Drive-hosted presentations. Published/HTML presentations and Google text exports retain text-only fallbacks.
3. `unpdf`, already installed, validates the PDF and streams its text. Every physical PDF page survives, including blank/image-only pages. No page rasterizer or new dependency is installed.
4. The centralized Gemini gateway sends the actual PDF bytes as an `application/pdf` inline part plus the selected rubric and supplemental text in one `generateContent` request. `gemini-3.6-flash` is first, `gemini-flash-latest` is the compatibility fallback. Text and image gateway interfaces remain compatible.
5. Scoring validates finite category scores and recomputes their sum. General/custom categories use 25/25/25/25; specialized tracks retain 25/35/25/15. Actual page references and observations accompany up to 12 priority slide recommendations. Prompts credit existing diagrams, inspect layout/readability/density, and distinguish mockups from implementation evidence.
6. Existing score columns, legacy topic recommendations and history remain. Optional `analysis`, `slideFeedback` and the submitted custom rubric are stored inside `ai_feedback` JSONB. PDF bytes remain ephemeral. The missing `track_id` insert/list compatibility remains in place.

Native PDF was chosen over rendered per-slide images to avoid additional deployments, dependencies and repeated model calls. See [Gemini document processing](https://ai.google.dev/gemini-api/docs/document-processing) and the [generateContent API](https://ai.google.dev/api/generate-content).

## Truthful modes

- `visual_text` / **VISUAL + TEXT**: a PDF request returned valid scoring and in-range slide evidence. The server sets this mode; the model cannot self-declare it.
- `text_only` / **TEXT ONLY**: no usable visual result; extracted text was successfully evaluated by AI. Missing text does not prove a diagram or screenshot is absent.
- `heuristic_fallback` / **HEURISTIC FALLBACK**: AI unavailable, output invalid, no usable extracted text, or time budget exhausted. Deterministic text scores are provisional. Custom rubrics cannot be faithfully applied by deterministic rules, and the feedback discloses that limitation.

Historical Phase 1 evaluations without vision metadata display TEXT ONLY (or HEURISTIC FALLBACK when already flagged). Historical scores and feedback are not rewritten. The UI defaults ambiguous/new submissions to General while retaining confident specialized detection and explicit selections.

## Limits and security

- PDF: 8 MiB, 1–60 pages, 120,000 extracted text characters. PDF magic bytes and parsing must both succeed; encrypted/invalid/oversized PDFs are rejected rather than silently bypassing validation.
- Text/HTML fallback: 512 KiB. Supplemental model text is capped at 35,000 characters; native PDF input still includes all admitted pages.
- Download: 4.5 seconds per candidate including DNS, up to three manual redirects; shared ingestion budget 15 seconds including a maximum 5-second parse phase.
- AI: shared maximum 30 seconds. Document cascade uses up to 20 seconds and at most two model attempts; text fallback shares remaining time and also has at most two attempts. The API reserves time for persistence within its 60-second function budget.
- HTTPS, no embedded credentials/custom ports, no cookies or forwarded authorization. Redirects are revalidated against trusted provider download hosts. All DNS answers must be public; the HTTPS socket is pinned to a validated address with normal hostname/TLS verification. IPv4/IPv6 private, loopback and metadata targets are blocked.
- Body sizes are checked before and during streaming. Compressed HTTP bodies are rejected. Document contents, credentials and provider error bodies are not logged. Deck instructions are treated as untrusted input in the judging prompt.

The parser is not a separate process sandbox: its timeout is cooperative with PDF.js loading-task cleanup. Native PDF reasoning can still be mistaken; an evaluation is not independent verification of the team's implementation.

## Supported inputs and limitations

Public Google Slides edit/share links (`docs.google.com` or `slides.google.com`), Google Drive `/file/d/…`, `/open?id=…` and `/uc?id=…` links work when anonymous download/export is allowed. Drive-hosted PDFs use native vision. Drive-hosted native Slides try PDF export. Existing allowlisted direct PDFs and accessible HTML/plain-text links retain support; public published Slides can fall back to extracted HTML text.

Private/authenticated files, arbitrary external PDF domains, raw PPTX binaries and presentations requiring an interactive confirmation are not supported. Canva pages may yield text-only content; they are never claimed as visual analysis without actual PDF bytes. This team API continues to accept links; no new file-upload UI is introduced.

## Validation

Run `npm run test:ppt`, `npm run typecheck`, and `npm run build`. The test suite creates synthetic PDFs locally (vector architecture, raster mockup, text-only and image-only pages) using the existing jsPDF dependency. It executes the actual extractor, gateway, engine, API and rendered UI with explicit network/database mocks. It covers downloads/redirects/DNS pinning, size/page/text/time limits, all rubric modes, mode labels, custom-rubric storage, legacy feedback and missing-column insertion compatibility.

Live verification used a synthetic PDF only: Google HTTPS transport succeeded; `gemini-3.6-flash` recognized the diagram and raster screen and rejected mockup-only implementation proof in approximately 4.8 seconds. `gemini-3.8-flash` exceeded the bounded request timeout, motivating the faster primary model. No private documents or Supabase writes were involved.

Deployment needs the existing server-side `GEMINI_API_KEY` and model quota. No database migration is required. Push/deployment still require the user's explicit approval.
