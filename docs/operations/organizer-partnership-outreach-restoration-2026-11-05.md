# HackerMate organizer partnership outreach — controlled restoration (2026-11-05)

## Why historical sending stopped

The old auto-scrape-leads cron was decoupled from enrichment and bulk Resend sends during source-discovery reliability work. scripts/enrich-organizer-leads.js is a legacy script which extracts arbitrary page emails, can mark existing records new and attempts a bulk send. Do NOT schedule or run it. The healthy organizer-prospect-preview workflow only produces event candidates.

At audit, CRM had 1,118 leads, 999 marked previously pitched, 977 marked removed, 112 without email, one unknown email outcome and ZERO new leads with eligible email. The November 5 public prospect preview produced 32 possible events, not verified organizer contacts. Historical pitch markers do not establish delivery.

## Controlled replacement

GitHub Actions organizer-partnership-outreach.yml runs once daily at 05:17 UTC / 10:47 IST, after the 09:45 IST prospect preview. It sends one authenticated HTTPS request with existing GitHub CRON_SECRET to /api/cron/organizer-outreach; curl has zero retries and no redirects. Do not separately enable Vercel cron for this endpoint.

The endpoint uses existing production Resend and Supabase settings. A lead is eligible only if:
- CRM status exactly new; no pitch_sent_at and no last_sent_to.
- Exactly ONE syntactically valid organizer email; never a comma-separated scrape.
- HTTPS Unstop, Devfolio or Hack2Skill event URL.
- Founder/admin independently verified the email as the actual event organizer contact, and added this exact standalone line to CRM Notes: [HACKERMATE_OUTREACH_APPROVED_V1]
- No historical pitched/removed/archived/unknown recipient shares that email or handled event URL.
- No duplicate email or event URL within the batch.

Existing app_settings primary-key inserts serve as one IST-day claim and separate SHA-256 recipient claims, each created BEFORE provider contact. Recipient claims are retained on all outcomes including unknown/provider rejection/bookkeeping failure. Never automatically delete/reset them or retry a failed recipient. Initial daily limit: FIVE organizer emails. Email budget checks are advisory across all senders, not a transactionally guaranteed global limit.

The sender records pitch_sent only after intended-recipient provider acceptance (not delivery). Unknown outcomes are marked email_outcome_unknown, with claims held. It never restores removed leads, never sends from sandbox sender config, never creates partner portals or assumes any partnership agreement.

## Launch and recurring operation

1. Merge only after final-head CI and founder authorization; verify the exact Vercel deployment is READY.
2. Inspect the next GitHub scheduled workflow execution, CRON_SECRET presence (never expose value), and aggregate result. no_eligible is expected until an independently verified CRM contact is approved.
3. Review the Organizer Prospect Preview artifact. It lists candidate events, not verified email addresses. Check official event/organizer identity, published contact address, current event and exact source URL. Do not revive any previously pitched, removed or unknown record.
4. For a genuinely new eligible organizer lead, record one verified contact email in the admin CRM, mark status new and add the approval note marker as a standalone line.
5. Review each scheduled GitHub run, Resend provider acceptance/delivery records and Gmail replies. On any uncertainty, inspect provider logs before any manual decision. No automatic resends.
6. Increase the five-per-day cap only after a successful small-batch acceptance/deliverability review.

## Limitations

- NO eligible contacts existed at audit time. This restores a real daily sender for approved new contacts, not autonomous contact harvesting. Prospect preview provides events for human verification; the sender will correctly send zero until new contacts are approved.
- The old manual/bulk-sending endpoints do not share this new claim ledger; do not manually send to scheduled contacts concurrently. Unified provider idempotency and transactional global quota need separate work.
- No live email was sent or manually triggered as part of this patch. GitHub scheduling may skip events and CI proves only offline behavior.
- The separate security Draft PR, STAB-006 and STAB-011 are unchanged.

Offline regression entry: node --test scripts/test-scheduled-organizer-outreach.cjs
