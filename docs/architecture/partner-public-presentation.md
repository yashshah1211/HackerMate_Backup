# Partner V1 public presentation

The public `/partners/[slug]` route selects presentation through
`partner_configs.features.portal_version`. Only the exact string
`organizer-v1` opts into `PublicEventPage`. Absent, `legacy`, unknown, and
malformed values select `LegacyPartnerPage`. The legacy component is an
unchanged extraction of the page at `622648f`; its discovery, authentication,
tracks, teams, badges, and actions retain their existing behavior.

No partner is activated by this commit. There are no schema changes, seed
updates, production writes, or organizer dashboard changes.

## Public read boundary

`src/lib/partners/public.ts` resolves the slug server-side using only the
public anonymous key, with sessions disabled. It does not read cookies,
registrations, profiles, organizer assignments, submissions, or analytics.
It requests explicit partner columns and event facts from existing tables.
The only AI feedback field requested is the effective approval status through
a PostgREST JSON text projection. Full AI feedback and organizer IDs are not
requested. Normalization drops all unrecognized fields before rendering or
passing image props to a client component.

The V1 event gate matches the existing public count/discovery RPCs: require
`archived IS FALSE`, then an external/null type or effective approved status
(status, AI status, then the existing non-native fallback). An unavailable or
unpublished association produces the partner's own identity and a finalized-
information placeholder, with no event facts or community destination.

The V1 presentation requests neither counts nor discovery: it has no public
participant metrics and works with zero registrations. The legacy component
still uses the existing safe discovery projection and self-scoped helper.

React request caching shares resolution between page and metadata. A missing
slug uses Next's not-found response and local public fallback; query failures
are logged and produce an unavailable state, rather than false not-found or
zero-count claims.

## Configuration contract

Existing top-level fields: `slug`, `hackathon_id`, `partner_name`, `tagline`,
`logo_url`, `banner_url`, `brand_color`, and `accent_color`.

Recognized features are limited to:

| Field | Shape / behavior |
| --- | --- |
| `portal_version` | Exact `organizer-v1` opts in; all other values retain legacy. |
| `official_website` | Optional HTTP(S) organizer website URL. |
| `public_contact` | Optional `{ "label": "Public help desk", "url": "https://…" }`, intentionally public. |
| `approved_links` | Optional array of `{ label, url }`; validate up to eight entries. |
| `registration_mode` | Optional `external` or `native`; a native event cannot be turned into an external registration claim. |

Official registration comes from the associated event's validated
`hackathons.website_url`, separately from the organizer website. Event facts
come from its name, description, dates, mode, location, and recorded minimum /
maximum team sizes. The partner tagline takes precedence over the short event
description. Unknown modes, invalid dates, impossible team limits, and reversed
date ranges are omitted. A single recorded team bound is labeled explicitly;
the other bound is never invented. Dates use the stored calendar day and UTC
formatting, with compact ranges and full machine-readable dates.

URLs require explicit HTTP(S), a hostname, no credentials, no control characters
or backslashes. Other schemes and protocol-relative links are rejected. Images
also permit validated root-relative existing assets. External links use
`noopener noreferrer` and announce their new-tab behavior. There is no HTML or
CSS configuration: all text is escaped by React. Colors accept only six-digit
hex; accent then brand color is used only on the small identity border. Primary
interactions always use HackerMate lime. Broken logos restore a text initial;
broken optional banners disappear. Image props disable referrer transmission.

Public features must never contain private organizer information or authority.
They are public data already; presentation filtering cannot make stored secrets
private. Provisioning/configuration tooling remains future work.

## Page and metadata

The page has HackerMate co-branding, event identity and concise introduction,
separate official-registration and teammate CTAs, confirmed event facts, a
short description of HackerMate's role, and approved organizer links. The
community destination is `/hackathons/<resolved event ID>` and handles its own
auth flow. Missing registration URLs explain availability without disabling
teammate discovery; missing associations omit the community link altogether.

The existing font variables provide Bricolage Grotesque, Instrument Sans, and
JetBrains Mono. Scoped CSS uses the requested dark palette, a left-aligned
desktop composition, compact facts, stacked mobile actions, semantic headings
and definition lists, and visible keyboard focus. There are no automatic
animations. Optional artwork never reserves a large empty hero space.

Metadata uses resolved event/partner title and description, the partner's
canonical path, and only validated configured artwork for OpenGraph/Twitter.
With no configured artwork, image arrays are empty rather than fabricated or
inherited unrelated event images.

## Validation

- `node --test --test-reporter=spec scripts/test-partner-presentation.cjs`
  runs the real resolver, route, metadata, presentation, and image failure
  component offline, with signed-out fixtures and network-free mocks.
- Existing compatibility tests now load the extracted legacy component;
  all 35 checks are preserved. An additional byte-identity regression confirms
  the extraction against `622648f`.
- Partner authorization, organizer API, and CSV regressions remain applicable.
- Typecheck, targeted lint, and whitespace checks cover the new implementation.
  Legacy lint diagnostics remain inherited from the byte-identical extraction.

Visual QA used an isolated headless Chrome preview of the real component/CSS,
fake event data, and cached local fonts. Full, minimal, missing-event, and long-
content fixtures passed at 360, 390, 768, 1024, and 1440 CSS pixels. Equivalent
200% zoom reflow was checked at 512 and 180 CSS pixels with scale 2. All 22
layouts had zero horizontal overflow; all six keyboard link destinations had
visible focus outlines. Reduced-motion preference was enabled. Mobile, tablet,
desktop, minimal, and missing-event screenshots were inspected.

This is component/CSS browser verification, not a full Next application
integration test or an actual browser-zoom command. The previously verified
full-app build/runtime limitation from missing public Supabase environment
variables remains unchanged; build was not rerun for this commit. No production
connection was used for visual QA.
