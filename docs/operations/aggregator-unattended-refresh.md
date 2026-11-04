# HackerMate unattended source refresh — existing infrastructure only

## Purpose and release hold

The worker uses GitHub Actions (Node.js 22), existing Supabase project
rhryjrbebfrrfhtyyzbs and the existing HackerMate parsers. It does not use
AI APIs, Docker, new cloud projects, the Vercel cron endpoint, or an
unrestricted browser crawler. It never deploys or promotes a public domain.

The worker performs three bounded passes: refresh source-verified records first,
adopt uniquely matched and freshly verified legacy records through metadata-only
writes under the founder's 2026-11-03 bulk policy, and discover/insert genuinely
verified new opportunities. Organizer fields, registrations, teams, saves and
partner settings are protected by the existing guarded PostgreSQL functions.

## One-time operator setup

1. Merge the separately reviewed Draft PR. Do not promote a Vercel build as
   part of this workflow change.
2. In the EXISTING GitHub repository yashshah1211/HackerMate_Backup open:
   Settings > Secrets and variables > Actions > Secrets > New repository secret.
   Set the name HACKERMATE_AGGREGATOR_SERVICE_ROLE_KEY and use the EXISTING
   Supabase project service_role/secret key for rhryjrbebfrrfhtyyzbs.
   Never paste the key into chat, an issue, a PR, a commit, or a screenshot.
3. Under Settings > Secrets and variables > Actions > Variables add
   HACKERMATE_AGGREGATOR_ENABLED with the value true only when ready for a
   controlled run. When absent or false, the scheduled write job is skipped.
4. In Actions > HackerMate Unattended Source Refresh > Run workflow, choose
   branch main and mode dry-run first. Verify the offline qualification and
   JSON summary. Dry-run reads sources but makes no production writes.
5. When dry-run passes, run apply once, verify the preserved relationship
   counts and accurate directory classification, then leave enabled for
   future scheduled jobs.

Do NOT enable the existing Vercel /api/cron/auto-scrape-leads route or change
its firewall policy. The GitHub job is independent of the old public site.

## Frequency, limits, and monitoring

Schedule: 23 1,9,17 * * * UTC, normally three runs daily. GitHub scheduling
is best-effort and may be delayed. Source evidence expires after 26 hours, so
monitor missed executions and growing stale backlogs.

Each run uses allowlisted source origins and paths, robots compliance,
redirect denial, response-size caps, rate pacing, strict source validation,
identity deduplication, current row snapshots and SQL compare-and-apply
guards. It prioritizes oldest evidence, then rotates among legacy records
and source discoveries. Counts are logged as AGGREGATOR_RESULT and posted
to the GitHub Actions job summary.

If remaining_refresh rises, capacity is too low for the number of admitted
records: adjust the worker budget or cadence through review, NEVER make
expired observations count as fresh. If any provider becomes unavailable,
investigate documented source schemas and access policies. Do not bypass
robots or invent event dates. Individual failures are held without blocking
other valid opportunities.

## Emergency stop

Set HACKERMATE_AGGREGATOR_ENABLED=false in repository Actions variables
and cancel any already-running source-refresh job. If necessary revoke or
rotate the dedicated repository secret. Disabling the variable only stops
future runs, not transactions already committed.

## Guarded database write modes

- Legacy and partner-protected records: store_hackathon_source_evidence
  updates metadata only; no organizer field, registration, team or partner
  configuration is rewritten.
- Source-created records: begin_hackathon_source_check followed by
  apply_hackathon_source_check maintains source-controlled facts with the
  existing editorial protection logic.
- New records: apply_hackathon_source_check handles identity matching
  and atomic insertion; nonmatching/invalid discoveries are held.

Existing PR #99 and PR #100 migrations are prerequisites. This workflow does
not change migrations, Vercel deployment aliases, cron configuration or
firewall settings. Public release still needs a separate final authorization.
