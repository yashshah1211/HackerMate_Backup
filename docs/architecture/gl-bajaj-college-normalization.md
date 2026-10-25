# GL Bajaj college normalization

Status: Phase A (application code) is published as PR #64. Phase B (database) is prepared locally only: the migration, read-only checks, rollback and local PostgreSQL test exist, but nothing has been applied to production. See "Phase B" below.

## Canonical colleges

Two separate entries in `COLLEGES` (`src/lib/colleges.ts`). They are never merged.

- `GL Bajaj Group of Institutions, Mathura`
- `GL Bajaj Institute of Technology & Management, Greater Noida`

## Normalization rules (`normalizeCollege`)

The existing steps run first and are unchanged: exact case-insensitive match against `COLLEGES`, then `COLLEGE_EXACT_ALIASES`. Only if both miss, the input's match key is compared exactly against a reviewed list.

The match key lowercases, turns `&` into `and`, replaces other punctuation with spaces, collapses whitespace, and joins runs of single letters (`G.L.` and `G l` both become `gl`).

| Key | Canonical |
| --- | --- |
| `gl bajaj group of institutions mathura` | Mathura |
| `gl bajaj group of institution mathura` | Mathura |
| `gl bajaj mathura` | Mathura |
| `gl bajaj institute of technology and management greater noida` | Greater Noida |

There is no substring, prefix or fuzzy matching in normalization. Everything else is returned whitespace-collapsed, as before. That includes city-less names (`GL Bajaj`, `GL Bajaj Group of Institutions`, `GL Bajaj Institute of Technology and Management`), `GLBITM`, `GL Bajaj Greater Noida`, values naming both cities, and unrelated colleges.

## Dashboard compatibility (`collegeMatchValues`)

The dashboard's same-campus list is an exact match on `profiles.college`. Existing GL Bajaj profiles still hold legacy spellings until a backfill. Normalizing alone would therefore hide those peers.

- Colleges other than the two GL Bajaj entries return one value, and the query stays `.eq("college", value)` exactly as before.
- For GL Bajaj Mathura, the query uses `.in("college", …)` with the canonical name, the reviewed legacy spellings listed in `CAMPUS_REVIEWED_SPELLINGS`, and the user's own stored spelling.
- Greater Noida uses its canonical name and the user's own spelling only. No Greater Noida legacy spellings have been reviewed.

Coverage is incomplete. A stored spelling that is not on the reviewed list and is not the viewer's own spelling is not matched. Do not add unreviewed spellings to close the gap; the Phase B backfill is the fix.

Until Phase B ships, the application change is not complete for same-campus matching.

## Phase B (database): prepared, not applied

Files:

| File | Purpose |
| --- | --- |
| `supabase/migrations/20261024120000_gl_bajaj_college_alias.sql` | Forward-only, single-transaction migration with guards |
| `scripts/sql/gl_bajaj_phase_b_precheck.sql` | Read-only gate before applying (one SELECT, no user ids) |
| `scripts/sql/gl_bajaj_phase_b_postcheck.sql` | Read-only gate after applying |
| `supabase/rollback/20261024120000_gl_bajaj_college_alias_rollback.sql` | Manual, transactional rollback |
| `scripts/test-gl-bajaj-college-alias-local.py` | Runs all of the above against synthetic data in a disposable local PostgreSQL cluster |

### Production facts the design relies on (user-verified 2026-10-25 read-only audit)

- PostgreSQL 17.6. 19 GL Bajaj-like profiles: 12 explicitly Mathura across 10 stored spellings, including 1 exact canonical profile. Therefore only 11 legacy Mathura profiles across 9 legacy spellings require backfill. The 7 cityless/ambiguous profiles remain unchanged. 0 explicit Greater Noida profiles.
- No GL Bajaj rows in `matchmaking.college_alias`; the already-canonical Mathura profile has a NULL cached `builder_feature.college_key` and needs cache repair, without a profile update. Phase B is not applied.
- `matchmaking.college_key(v)` looks up `matchmaking.norm(v)`: lowercase, trimmed, whitespace collapsed, punctuation kept. Aliases must therefore be stored per punctuation variant.
- `matchmaking_profile_changed` is enabled in normal mode `O`. It (AFTER INSERT/UPDATE OF college, …) refreshes `builder_feature`, `builder_feed` and the user's teams. Inserting aliases alone refreshes nothing.
- The live trigger list recorded in `supabase/rollback/phase1_prestate.sql` does not include `trg_normalize_college_profiles`, so the migration does not depend on it. If it exists, it leaves the canonical value unchanged.

### What the migration does

All inside one transaction (`lock_timeout` 5 s, `statement_timeout` 120 s). Any failed guard raises `GL Bajaj Phase B guard: …` and nothing is kept.

1. **Schema checks.** The required matchmaking tables and functions exist, `matchmaking.norm` keeps punctuation, and `matchmaking_profile_changed` is enabled on `profiles`.
2. **Freeze inputs.** Locks `college_alias` against concurrent writers and row-locks every profile whose college contains "bajaj".
3. **Classify** each such profile with the same key rule as Phase A (`pg_temp.gl_bajaj_match_key`, dropped before COMMIT):
   - `legacy_mathura`: the key is a reviewed Mathura key and the value is not exactly the canonical name.
   - `legacy_greater_noida`: the key is the Greater Noida key and the value is not exactly the canonical name.
   - `ambiguous`: contains "gl bajaj"/"glbajaj" but matches neither campus. This includes city-less names and names mentioning both cities.
   - `canonical_*`: exactly a canonical name, for example saved through Phase A.
   - `unrelated`: anything else (e.g. Bajaj Institute of Technology Wardha).
4. **Drift guards (first run).** Exactly 11 `legacy_mathura` rows with 9 distinct spellings, exactly 7 `ambiguous` rows, 0 `legacy_greater_noida` rows, and every Mathura candidate names Mathura and not Noida. Exact canonical values are classified before legacy keys and are excluded from these counts. A second run is recognised by 0 legacy rows plus an existing backfill record. Every other state aborts.
5. **Aliases**, stored in `matchmaking.norm()` form:
   - `gl-bajaj-mathura`: the canonical name, the 7 Phase A reviewed spellings, and each of the 9 stored legacy spellings found in step 3. Expect 7 to 16 rows, depending on overlap.
   - `gl-bajaj-greater-noida`: the canonical name only. No Greater Noida legacy spellings have been reviewed.
   - **Guards:** the migration aborts if any existing alias maps an intended string to another key, if any existing row already uses either key, or if any intended alias is not campus-explicit for its key. Inserts use `ON CONFLICT DO NOTHING`, and a fingerprint confirms unrelated aliases are byte-identical afterwards.
6. **Backfill.** Records the 11 previous legacy values in the private `matchmaking.gl_bajaj_college_backfill` table, then sets exactly those 11 rows to `GL Bajaj Group of Institutions, Mathura`. The update must touch exactly 11 rows. The aliases already exist at this point, so the trigger caches `gl-bajaj-mathura`. The already-canonical profile is not updated or recorded for rollback.
7. **Cache repair.** Refreshes only profiles and teams whose stored college now resolves to a GL Bajaj key but whose cache disagrees. This repairs the audited canonical Mathura profile's NULL cached key and college feed bucket without changing its college or `updated_at`.
8. **Post-conditions.**
   - No legacy row is left.
   - Ambiguous and unrelated rows have the same value and the same cached key as before.
   - Every GL Bajaj cached key matches its stored college, in both directions.
   - Every eligible GL Bajaj builder has its `college:` feed bucket.
   - Team caches are consistent, and unrelated aliases are unchanged.

### Expected effects on production (first application, if the precheck still matches the audit)

| Object | Change |
| --- | --- |
| `matchmaking.college_alias` | +8 to +17 rows (7 to 16 Mathura, 1 Greater Noida); 0 updated or deleted |
| `public.profiles` | 11 legacy rows: `college` changed to the Mathura canonical; `updated_at` set by `set_profiles_updated_at`; existing canonical profile unchanged |
| `matchmaking.gl_bajaj_college_backfill` | new private table, 11 rows; excludes the pre-existing canonical profile |
| `builder_feature` / `builder_feed` | the 11 backfilled profiles plus the 1 stale canonical Mathura profile |
| `team_feature` / `team_feed` | teams owned or joined by the 11 (precheck info row 27), re-derived from unchanged inputs by the existing trigger; plus any stale canonical teams identified by the precheck |
| Ambiguous 7 rows, everything else | unchanged |

Side effects to expect: the 11 legacy users' `updated_at` changes. If `profiles` is in a realtime publication, subscribers receive 11 update events. `refresh_team` takes a row lock on each related team.

### Release order

1. **Phase A first.** Merge and deploy PR #64. It works before and after Phase B: the dashboard compatibility list covers legacy spellings until the backfill and the canonical name afterwards.
2. **Precheck.** Run `scripts/sql/gl_bajaj_phase_b_precheck.sql` read-only against production as soon as possible after the deploy. Every `gate` row must pass.
   - Review the `detail` rows: the 9 `legacy_mathura` spellings become permanent aliases. Confirm the canonical Mathura info row is 1 and the canonical Greater Noida info row is 0, matching the audit.
   - Compare the `fingerprint` rows with the values printed by the local test.
   - Record the `info` rows.
3. **If the precheck no longer matches,** stop. Users re-saving their profile through Phase A move rows from legacy to canonical. Re-audit, then reconcile the migration constants, precheck/postcheck expectations, fixtures and runbook together in a reviewed edit; never relax the exact counts to accommodate unexplained drift.
4. **Back up.** Confirm a recoverable backup or PITR point and the migration-ledger procedure (`supabase/README.md`).
5. **Apply only after separate release approval**, and keep the single migration's NOTICE line (`profiles_updated=11, …`). Local verification or a passing read-only precheck does not grant that approval.
6. **Postcheck.** Run `scripts/sql/gl_bajaj_phase_b_postcheck.sql` read-only. Every `gate` row must pass, and the unrelated-alias count and fingerprint must equal the precheck.
7. **Follow-up (separate change).** Phase A's `CAMPUS_REVIEWED_SPELLINGS` can be reduced to the canonical name once the postcheck passes.

### Rollback

- Run `supabase/rollback/20261024120000_gl_bajaj_college_alias_rollback.sql` manually, after approval.
- It deletes only the rows with the two GL Bajaj keys, then restores the 11 recorded legacy profiles whose college still equals the canonical value. The pre-existing canonical profile is never in that record and its stored college remains unchanged. Rows with a different college after later user edits are skipped and counted.
- It refreshes every builder or team cache still holding a GL Bajaj key, and drops the backfill table once it is empty.
- The local test proves that rollback returns the synthetic database to its exact previous alias table and college values, and that the migration then re-applies cleanly.
- Phase A remains compatible with either state, so rollback needs no frontend change.

### Known limits

- The match key strips non-ASCII characters in both JavaScript and SQL. A few exotic Unicode letters lowercase differently in the two, which doesn't affect any reviewed spelling.
- Profiles inserted concurrently with the migration by another transaction may cache a NULL key. The postcheck `stale` gate detects this, and re-running the migration repairs it (second-run path).
- Local runtime verification uses installed PostgreSQL 18.4. Static review against PostgreSQL 17 documentation found no version-18-only syntax; this does not establish runtime compatibility with production PostgreSQL 17.6 or verify its effective schema, function fingerprints or privileges.
