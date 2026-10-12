# Case-insensitive builder search rollout

Branch base: `d2322ff014d068ba350a90a581ec87e24afca3fa` (merged PRs #1–#5).

## Contract and scope

Non-empty searches call `search_builder_profiles(p_query, p_sort, p_limit)`.
It performs literal, case-insensitive substring matching against name, college,
and **individual** skills before applying the result cap. Empty searches keep
the existing direct profile query. `skills` remains a `text[]`; no profile data
or preferences are rewritten. `%`, `_`, backslash and filter punctuation are
ordinary search characters. Bound JSON RPC arguments never enter SQL syntax.

The function is `SECURITY INVOKER`, with an empty search path, authenticated-only
EXECUTE, an explicit `auth.uid()` check, and a 14-column directory projection.
Existing profiles RLS and column SELECT permissions remain authoritative. Email,
gender, account flags and unrelated profile metadata are not returned. No table
grants or RLS policies change. Self and both-way block exclusions remain in the
existing client hook after the capped response, as before.

`fit`/`new` retrieve by `created_at DESC`; `active` retrieves by `last_seen_at DESC
NULLS LAST`. UUID breaks timestamp ties deterministically. Client Fit ranking
still uses the existing recommendation ranks. Limits are clamped to 0–1000, with
a default of 1000. Query text is capped at 256 characters; longer input returns
an explicit error. Missing RPCs also produce an error, never a misleading
unfiltered or case-sensitive fallback. The existing one-time retry uses the same
endpoint. Request generations, initialization, debounce and invitation logic
are unchanged.

Three GIN trigram indexes support lowercased name, college and skill-document
candidate retrieval. The immutable skill-document helper aggregates skill labels
with separators **only as an index filter**. A second check against each array
element prevents matches spanning different skills. An existing `pg_trgm`
extension is reused in its current schema, rather than relocated. If absent it
is installed in `extensions`. Short/punctuation-only or very common terms can
still have broad candidate sets; PostgreSQL chooses the plan. Existing server
timeouts should remain in force. No claim of production latency or a mandatory
index plan is made from the local fixture tests.

## Required release sequence — not performed in Cloud

1. Before merging/releasing the client, the primary workflow must review the
   candidate migration, target schema and effective ledger, permissions, backup
   and rollback. Verify the 14 projected columns/types, existing authenticated
   SELECT grants, profiles RLS, `auth.uid()` access and `pg_trgm` availability.
   Historical migrations are not a production backlog: follow
   `supabase/README.md` and do **not** run a blanket database push.
2. Under separately approved database-release authorization, execute only
   `supabase/migrations/202610120001_builder_profile_search.sql`. It is additive
   and the old client continues to work. Regular index creation can block
   writes while building; schedule an appropriate window based on actual table
   size. The migration emits a PostgREST schema-cache reload notification.
3. Verify the new RPC is exposed to authenticated callers, denied to anon,
   respects RLS/column permissions, and correctly matches representative skills,
   punctuation, names and colleges. Measure real query plans/latency with the
   production schema and normal request timeouts; local fixtures cannot establish
   production performance. Verify all three indexes are valid before rollout.
4. Only then merge/release the client through the primary workflow. Test lower,
   upper and mixed-case terms; partial `script`; React Native, C++, C#, Node.js,
   Next.js; no-results/error/reset behavior; rapid searches/sorts/Retry; blocked
   and self exclusions; availability and invitations on mobile and desktop.
5. For rollback, revert the client first. The additive database objects can
   remain safely while reviewing removal. If removal is separately approved,
   drop `search_builder_profiles(text,text,integer)`, then its three named
   `profiles_builder_search_*_trgm_idx` indexes, then
   `builder_skill_search_document(text[])`. Do not drop or relocate `pg_trgm`
   or the extensions schema; other features may depend on them.

No migration was applied to a live database, no production credentials were
requested, and no production data/configuration changes or deployments were made.

## Reproducible offline validation

```sh
python scripts/test-builder-search-local.py --pg-bin /path/to/postgresql/bin
python scripts/test-builder-search-local.py --pg-bin /path/to/postgresql/bin --existing-trgm-schema public
node --test scripts/test-developers-search-race.cjs
node --test scripts/test-developers-empty-state.cjs scripts/test-builder-availability.cjs scripts/test-team-creation.cjs scripts/test-invite-handoff.cjs scripts/test-squad-matching.cjs
npm run typecheck
npx eslint src/app/developers/useDevelopersData.ts scripts/test-developers-search-race.cjs
git diff --check
```

The SQL runner creates its own loopback-only PostgreSQL cluster with fictitious
profiles, a restrictive test RLS policy and column grants. It removes remote PG
connection environment variables, ignores psql startup files, executes the actual
candidate migration and checks matching, punctuation/injection resistance,
ordering/limits, RLS/permissions, projection and index support. Its `finally`
block stops and deletes only its allocated temporary cluster. PostgreSQL server
and client binaries plus local `pg_trgm` are required; no application dependency
was added. Hook tests use controlled responses and a fake debounce clock.
