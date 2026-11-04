# HackerMate Daily Founder Brief — design review

## Why this replaces the old database dump
The November 2, 2026 Gmail report displayed +6 new builders, +0 teams, +0 invites and +0 connections, then attached a PDF dominated by users' emails and database tables. It omitted readable interpretation and crucial context about discovery/organizer records. A follow-up read-only historical query found 4 new event listings, 4 new organizer lead records and 0 event saves in that same period. Historical onboarding-completed count is a **current-state** check, not the status at signup time.

## New report
- **Inbox-first editorial brief**: what changed, four narrative signals, attention points, and practical next steps.
- **Founder-only PDF** with meaningful interpretation, new event examples, and confidence caveats. No raw customer emails, feedback bodies or message content.
- Aggregate counts additionally query onboarding completion of newly created profiles, event saves, organizer lead records, feedback, and prior equal-length windows. Failed count queries return **Unavailable**, not invented zero values.
- Uses existing PDF/Resend dependencies, Supabase read-only counts, and the same admin-report endpoint. No schema migration, external AI service, new secret, additional email, or scheduler change.
- The reporting period is **since the last accepted report checkpoint**, not necessarily 24 hours. Catch-up periods longer than 36h are flagged. Onboarding is explicitly labelled as current status. Event saves do not prove off-platform registration, and CRM records do not prove email delivery.

## Safety and validation
- The daily single-send reservation from PR #113 remains untouched.
- Existing report generation is retained in the source library for other callers. Only the scheduled email's HTML/PDF representation changes.
- Offline fixture and actual November 2 email inform the test cases. Unit tests verify missing counts, honest narratives, HTML escaping, PDF output and catch-up windows.
- Independently verify a sample rendered PDF and email HTML at mobile width and desktop, then confirm GitHub CI.
- Create and inspect a Draft PR; do **not** merge/deploy/send an extra report without owner approval.
