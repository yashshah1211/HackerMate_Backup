# Hackathon lifecycle and registration contract

Mission 20 uses independent event and application intervals. `src/lib/hackathons/lifecycle.ts` is the pure source of truth; every caller supplies the evaluation time. Ordinary discovery, guest/member details and native server submission share it.

## Date semantics

Calendar-only values cover Asia/Kolkata days. Starts are inclusive at 00:00; ends are exclusive at 00:00 the following day. Explicit-offset timestamps retain their exact instant, including an exact 23:59 cutoff. Impossible dates, timestamps without timezone offsets, and contradictory windows stay unknown. No event date substitutes for a registration date.

The existing registration columns are timestamps. Creation, organizer edits and new ingestion convert calendar-only inputs to their explicit India boundary before storage. A stored midnight cutoff is consequently displayed as that exact next-day instant; no source precision is guessed retrospectively.

## Independent states

Event state is upcoming, ongoing, ended or unknown. Registration is open, closed, not-yet-open or unknown. A containing valid registration window or an explicit open status supplies opening evidence. A future deadline alone does not establish opening. Explicit closure or a valid passed deadline wins. Running events with passed deadlines remain running with registration closed.

Native unknown availability offers Review registration with uncertainty text and deliberate confirmation. Confirmed application-start/end, event-end, identity, account and team-size restrictions are checked before submission. Display time refreshes every 30 seconds and on focus/visibility; submission uses fresh server time rather than the display snapshot.

## Discovery and presentation

Known-closed registrations are excluded from default active tabs. Availability groups precede relevance/date/prize ordering: open, unknown, not-yet-open, closed. An explicit registration filter can inspect closed events. Saved and Past retain their public eligible records; direct links remain readable. Search all listed events is an explicit historical scope. Approval and archive gates are unchanged.

The registration summary precedes long organizer content. Unknown state never promises a seat or successful registration. Official external links remain available with View official details wording when opening is unverified or closed. External community membership stays separate from official registration.

## Native submission

The browser calls POST /api/hackathons/[id]/register with its bearer session, optional team ID and whether it reviewed unknown availability. The endpoint validates the request, verifies the caller with getUser, reads only the caller profile, uses the caller RLS context, checks public/native eligibility, team ownership and actual size, capacity, and a fresh event read immediately before insertion. It never uses a service-role client or caller-supplied user/status. Existing registration rows are never overwritten. Capacity preserves waitlisting.

Important boundary: existing database INSERT permissions remain unchanged. A direct authenticated database caller can bypass this HTTP endpoint. Deadline/capacity reads and insertion are not one database transaction, so a concurrent metadata/capacity change remains possible. Authoritative database enforcement requires a separately approved migration/permission change; this implementation must not be presented as that guarantee.

## Content fidelity and sanitization

The renderer converts HTML to ordered allowlisted React nodes with parse5 7.3.0. It preserves paragraphs, original headings, list interleaving, ages/years, ordered-list start/value/reversal, emphasis, code and safe links. The plain-text path recognizes explicit headings, real list markers and basic Markdown links/emphasis; it does not guess sections from prose keywords. Full Markdown extensions are not implemented.

Script/style/iframe/object/template/SVG/MathML content and unsafe attributes are omitted. No raw HTML is injected. Safe HTTP(S) links and simple mailto links are supported; relative links resolve only against an available safe event website. Image alternative text is retained without loading remote images. Directory/search excerpts use the same safe content parser and omit script text. Existing flattened descriptions cannot recover deleted links or structure without separately verified source restoration.

## Ingestion and source ownership

Unstop and Hack2Skill registration fields map independently from event fields; Devfolio event dates remain event dates. Timezone-ambiguous provider dates remain unknown. New imports retain source description HTML and do not invent online format, perks, location or INR where unsupported. New-record upsert ignores existing URL conflicts.

New records store a lifecycle_ingestion snapshot in the existing ai_feedback JSON field: version, exact normalized source URL/platform and source-owned registration fields. No schema is added. A bounded refresh lane considers only approved, non-archived, external, unowned records with this marker. Partner identity/configuration is checked separately. A field refresh requires matching source identity and a stored value semantically equal to its previous source snapshot. Missing source values do not erase data. An update compares ID, URL, type, owner, moderation/archive state, old registration values and the complete prior feedback JSON before writing. Editorial metadata is preserved and unchanged source values yield no update.

Legacy records without an ownership snapshot and manual edits require review; the scraper does not claim authority over them. Refresh candidates do not enter outreach or broad event upserts. Dependency-read failure prevents all writes. No live scraper, cron, provider, production database, migration or deployment operation was used for qualification.
