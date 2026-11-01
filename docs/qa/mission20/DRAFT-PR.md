# Fix hackathon registration accuracy and organizer content fidelity

A running event previously remained an actionable discovery result after applications closed, and native registration ignored application deadlines. Shared event/registration states now drive default discovery, guest/member summaries, CTAs and an authenticated server registration endpoint. Date-only cutoffs include the final India day. Native events with unverified availability offer explicit Review registration rather than an open assertion.

Organizer content now renders in source order without stripping ages/years or guessing sections. Safe links, lists, paragraphs and entities survive while executable content is removed. Ingestion separates event/application dates and refreshes only unchanged scraper-owned fields through compare-and-set checks, preserving editorial/moderation/archive and partner controls.

Validation: 815 passing regressions; TypeScript and network-isolated production build passed; zero new scoped lint diagnostics against base; 14 serial browser checks passed, with final lifecycle reruns at all three widths. Exact file inventory and evidence: [Mission 20 qualification](https://github.com/yashshah1211/HackerMate_Backup/blob/fix/mission20-hackathon-discovery-quality/docs/qa/mission20/README.md). Matched synthetic before/after screenshots cover 390, 768 and 1440px. Production acceptance remains outstanding; no live provider operations, production data, schema/RLS, environment configuration, or deployment were changed.

Review the enforcement limit explicitly: the server endpoint validates the application path, but existing direct database INSERT permissions and nontransactional capacity/deadline races remain. Closing those requires a separately approved database change. Legacy records without source ownership metadata are intentionally left for review.

This PR is for independent review only. Do not merge or deploy as part of this task.
