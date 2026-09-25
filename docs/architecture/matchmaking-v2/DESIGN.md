# HackerMate matchmaking v2 — implementation handoff

Status: proposed architecture and executable SQL reference, not an applied migration.
The user approved scope, security assumptions, and drafting this implementation.
Antigravity owns adoption into `supabase/migrations/`, frontend integration, and
Supabase/runtime verification. No production database has been contacted.

## Decision record

| Decision | Alternative | Reason |
|---|---|---|
| Two independent scoring functions | One universal compatibility score | A teammate pair and a person filling a vacancy have different objectives. |
| Curated aliases and seven-dimensional evidence vectors | Embeddings/paid inference | Deterministic, explainable, inexpensive, auditable. |
| Private precomputed features plus bounded indexed retrieval | Normalize and score all 100k profiles on each request | Bounds expensive request-time work; introduces measurable retrieval approximation. |
| Nullable raw components plus neutral imputation | Drop missing components and renormalize | Prevents a single known booster from becoming a 100/100 recommendation. |
| Exact current eligibility before scoring | Cache complete recommendation results | Blocks, pending invitations, capacity, and bans must not wait for cache expiration. |
| Strict caller binding with definer RPCs | Invoker RPC reading reverse blocks | Existing blocker-only RLS can hide incoming blocks from an invoker. |
| SQL is authoritative for scores and explanations | Keep the browser's second scorer | Avoids dashboard/developers disagreement. |

This design does not promise exact global top-N retrieval or a probability of
successful collaboration. No API dependency or hosted vector service is added.

## Skill taxonomy

The permanent domain order is:

| Index | Domain | Strong evidence examples | Cautions |
|---|---|---|---|
| 1 | Frontend | React, Vue, Angular, Svelte, Next.js | Tailwind is frontend evidence, not UX research. |
| 2 | Backend | FastAPI, Django, Express, Spring Boot | PostgreSQL is partial backend evidence; Python alone is not. |
| 3 | AI/ML | PyTorch, TensorFlow, scikit-learn, ML, deep learning | Pandas/NumPy are weak evidence; language choice is not ML expertise. |
| 4 | Mobile | Flutter, React Native, Android, iOS | React Native and React have separate canonical keys. |
| 5 | Cloud/DevOps | Kubernetes, Terraform, Docker, CI/CD, AWS | Knowing Docker alone is partial evidence, not verified infrastructure mastery. |
| 6 | UI/UX | UI design, UX research, Figma, prototyping | Figma alone gets 0.7 evidence specificity. |
| 7 | Product/Pitch | Product management, pitching, market research | Do not infer this role from college year or social popularity. |

Normalization is `lower(trim(collapse_whitespace(value)))`, followed by an exact
alias lookup. Preserve punctuation: C, C++, and C# are different; substring
matching would misclassify React Native as React. Deduplicate after alias mapping.

For canonical skill `s`, store a seven-element vector `W[s]` in `[0,1]^7`.
The user's domain vector is `d_u[k] = max(W[s][k])` across their mapped skills.
This is **evidence specificity, not skill proficiency**. Max aggregation prevents
ten synonymous frontend tools from counting as ten independent capabilities.
The SQL file contains the full seed matrix and alias rows, not just examples.

Foundation keys are Git, JavaScript, TypeScript, Python, SQL, HTTP, REST API,
Java, Go, C, C++, and C#. Foundations are an interoperability signal; they do
not establish communication skills, English proficiency, or interpersonal fit.
No tool-to-language inference is added: React does not automatically assert
TypeScript, and FastAPI does not automatically assert Python.

Unknown skills remain in the original profile for display. They contribute no
invented category. Entirely unmapped skill sets produce unknown role evidence,
not an incompatible profile. Track unmapped keys in an aggregate maintenance
report and add reviewed aliases through versioned migrations.

`role_definition` uses required-domain sets. Most roles require one domain;
Full Stack Developer requires BOTH frontend and backend. Role readiness uses
the minimum across those domains. Generic `Developer` and unrecognized custom
roles stay unresolved instead of being guessed. All existing UI role labels
should be included in the adoption taxonomy review.

College matching uses curated exact aliases. DJSCE and its full name resolve
to one key; ambiguous VIT/MIT strings do not. Unmapped colleges are unknown,
including names not yet present in the small seed list. The current schema
cannot establish physical proximity or hackathon-specific college eligibility.

## Surface A: builder to builder

All raw sub-scores lie in `[0,1]`. Let `I(x) = x` when known, otherwise `0.5`.

```
Score_A = round(100 * (
    0.55 * I(S_comp)
  + 0.20 * I(S_base)
  + 0.15 * I(S_exp)
  + 0.10 * S_context
))
```

Use fixed weights; do not clamp to 5–99 and do not renormalize around missing
components. Sort on the unrounded sum, then evidence coverage, then UUID.

**Complementarity.** Define the directional additional coverage:

```
N(a | b) = sum_k(max(d_a[k] - d_b[k], 0)) / sum_k(d_a[k])
S_comp  = (N(a | b) + N(b | a)) / 2
```

If either vector has no mapped role evidence, the directional terms and
`S_comp` are unknown. Identical vectors score zero, including identical
partial-evidence vectors. Disjoint strong domains score one. A React/FastAPI
generalist paired with another identical generalist is less complementary
than a React specialist paired with a backend specialist. This is about
additional indicated coverage, not proof that the person cannot do other work.

**Foundation overlap.** For canonical foundation sets `F_a`, `F_b`:

```
S_base = min(1, |F_a intersection F_b| / 2)
```

If either foundation set is empty, use unknown. If both are populated but
disjoint, use zero. Shared Git plus TypeScript reaches one without rewarding
large, inflated lists. Known aliases count once.

**Experience balance.** Let `w = max(0, wins, has_won ? 1 : 0)` and
`p = max(0, participations, w)`. Define:

```
E(u) = 0.8 * ln(1 + min(p,10)) / ln(11)
     + 0.2 * ln(1 + min(w, 3)) / ln(4)

S_exp = 0.5 * (1 - |E(a)-E(b)|)
      + 0.5 * min(1, (E(a)+E(b))/0.8)
```

This modest-weight component rewards collective exposure and manageable
experience differences. It does not assume seniors want to mentor or punish
beginners as a hard rule. `has_won` supplies a minimum win count, not a second
independent reward for the same achievement.

Important schema limitation: the repository uses zero/false defaults. Those
cannot distinguish a new unfilled profile from confirmed zero experience.
V1 therefore treats all-zero/null experience as unknown. Positive evidence
activates `E`. A later explicit `experience_confirmed_at` field could distinguish
known beginners, but no such schema change is included in this draft.

`year_of_study` is displayed but not used as a skill proxy. GitHub repository
counts and popularity are not quality scores; `total_stars` and `public_repos`
are excluded. `top_languages` is also excluded in v1 because it overlaps the
explicit foundation signal and lacks sufficient provenance/freshness in this
contract. These omissions are deliberate, not missing implementation.

**Context.** Candidate availability `A` is 1 for true, 0 for false, 0.5 for null.
College value `C` is 1 for the same mapped college and 0.5 otherwise.

```
S_context = A                         when college preference is off
S_context = 0.75*A + 0.25*C            when preference is on
```

Different college is neutral; same college is a bonus. Availability is never a
filter. This component makes the final score directional even though `S_comp`
and `S_exp` are symmetric. College's same-versus-neutral difference is
**1.25 points** (100*0.10*0.25*0.5).

## Surface B: builder to team

```
Score_B = round(100 * (
    0.60 * I(S_role_gap)
  + 0.30 * S_skill_fit
  + 0.10 * S_context
))
```

**Vacancy fit.** For each canonical open role `r`, let `D_r` be its required
domains. Let `n_t[k]` count distinct current members with a mapped assigned
`project_role` covering `k`. Define:

```
readiness(u,r) = min_{k in D_r}(d_u[k])
occupancy(t,r) = mean_{k in D_r}(n_t[k])
V(u,t,r) = readiness(u,r) * (0.85 + 0.15 / (1 + occupancy(t,r)))
S_role_gap = max_{r in roles_needed}(V(u,t,r))
```

Use the best one-role fit; do not divide by the number of all advertised roles.
A frontend builder should not lose points merely because the team also seeks
a designer. The occupancy adjustment slightly favors an unrepresented role;
it never cancels an explicit vacancy merely because another member has that
role. Full-stack readiness is `min(frontend,backend)`, not their maximum.

No mapped vacancies, or no builder domain evidence, means unknown. A builder
with other mapped domains but zero evidence for a known vacancy has zero
vacancy fit. `matched_role` is null when readiness is zero.

**Skill coverage.** Team domain evidence is computed from the union of
`teams.skills` and current members' skills, including the owner if a legacy
roster omitted them. `teams.skills` is represented capability, NOT a wishlist
of missing skills. Member foundations are unioned in the same way.

```
S_skill_fit = 0.70*I(N(user | team)) + 0.30*I(S_base(user,team))
```

This rewards additional indicated capability and a small shared working
baseline. It is intentionally separate from matching an advertised vacancy.
An empty vacancy list does not imply that every absent domain is required.

**Team context.** Let `m` count distinct roster users plus the owner; `M` is
`max_members`. Already-full teams are filtered first.

```
T = min(1, m/max(M-1,1))
S_context = T                         when college preference is off
S_context = 0.75*T + 0.25*C            when preference is on
```

This small bonus favors an established team close to filling its roster.
It does not reward large capacity or mostly empty teams. Changing this product
preference later should be a score-version change. Viewer availability is
constant across their team candidates, so it adds no ranking information.

## Unknowns, explanation payloads, and examples

`components` preserves raw unknown components as JSON null. `confidence` is
the sum of weights with observed inputs, from 0 to 1; it is **evidence coverage,
not statistical confidence**. For Surface B its effective weights are 0.60
role, 0.21 novelty, 0.09 foundation, and 0.10 context. Context evidence is
counted proportionately when college preference is enabled.

The UI should display `Discovery suggestion` instead of a numeric score if
confidence < 0.5 or the main role/complementarity component is null. Keep
neutral imputation internally so missing data is not confused with a zero.
Do not label a score `86% chance of success`. Display `Fit: 86/100` when supported.

For builders with two participations, no wins, Git and TypeScript, both
available, and college preference off:

| Pair | Complementarity | Foundation | Experience | Rounded fit |
|---|---:|---:|---:|---:|
| React + React | 0 | 1 | about 0.958 | 44 |
| React + FastAPI | 1 | 1 | about 0.958 | 99 |

The high second score reflects the chosen model, not demonstrated interpersonal
success. A builder with no mapped skills/experience and an available candidate
gets 55 internally and low evidence coverage, rendered as discovery.

Anti-gaming limitation: self-reported skill stuffing across all seven domains
can still increase coverage. Alias deduplication and max aggregation address
duplicate counting, not truthful proficiency. Future evidence verification
and declared preferred roles should improve this without penalizing honest
newcomers. Do not call self-reported signals verified skills in explanations.

## Database and authorization boundary

`blueprint.sql` contains all schema, seeds, feature rebuilds, maintenance
triggers, indexes, helper functions, both public RPC bodies, and privileges.
Private storage is under `matchmaking`; it must not be added to the exposed
PostgREST schemas. Only the public RPCs are executable by authenticated users.

Both RPCs enforce non-null `auth.uid()` and exact equality with `p_user_id`,
validate that the viewer is onboarded and not banned, and bound result count:

```
least(greatest(coalesce(p_limit,10),1),50)
```

Builder candidates must be onboarded, unbanned, not self, and not blocked in
either direction. Team candidates must be recruiting, not full, not owned by
the viewer, not already joined, and have no viewer pending request or invite.
They are excluded if a mutual block exists against the owner or any member.
The team owner's account must be onboarded and unbanned. A banned member is
not silently removed from capacity counts; membership moderation remains a
separate platform responsibility.

The RPCs deliberately use `SECURITY DEFINER` because they must see reverse
blocks that blocker-only RLS hides. All relations are schema-qualified,
`search_path=''`, and there is no dynamic SQL or client-selected scoring input.
The trusted migration owner must be able to read the necessary rows; do not
transfer ownership to an API role. No service-role credential reaches a browser.

Profile card columns returned:

```
id, full_name, avatar_url, college, bio, skills, github_url, linkedin_url,
year_of_study, is_available
```

Feature generation additionally reads `onboarding_completed`, `is_banned`,
`hackathon_participations`, `hackathon_wins`, and `has_won_hackathon`. It never
reads email. No restricted-table wildcard selection is used. Returned teams
contain only directory-safe card data and scoring metadata, not member IDs,
block lists, pending-request details, or internal workspace data.

Safety checks are current to the SELECT transaction snapshot, not a promise
that membership stays unchanged after the response. Apply/join/invite actions
must recheck authorization and capacity under their own transactional locks.
Recommended teams remain visitor views with View & Apply/Request to Join.
Management/export controls still require `(isMember || isOwner)`.

## Retrieval and performance contract

Feature vectors, alias canonicalization, and team rollups are built at write
time. Requests do not normalize 100k skill arrays or aggregate every team.
Arrays hold only seven domain values; a domain bit mask alone would lose partial
evidence. Foundations additionally use a cached `bit(16)` mask with permanent
slots declared in `skill.foundation_slot`: `bit_count(mask_a & mask_b)` is the
exact intersection size. Canonical arrays remain for returned explanations.
B-tree posting feeds implement indexed role/college retrieval. Pure arithmetic
invoker helpers are inlineable; every definer retains an empty search path.

Each feed uses `(bucket,ticket,entity_id)`, with `ticket=md5(entity_id)::uuid`.
A viewer/date-derived pivot selects a stable daily ring slice: an indexed
range at/after the pivot, then an indexed wraparound range before it. Each
range reads at most 96 entries and at most 96 survive per bucket. This is not
`ORDER BY random()` and does not sort an entire population per request.

Builder retrieval uses all seven domain buckets, availability, a general
exploration bucket, and optional same college: at most **960 distinct IDs**.
Team retrieval uses the viewer's indicated domains, general exploration, and
optional college: at most **864 IDs**. Actual pools are usually smaller after
deduplication. Request-time hard filters run on a materialized eligible set
before scoring; base-table profile/card hydration is limited to selected rows.

This is approximate retrieval. It can miss the global best result, and heavy
blocking or full teams can leave fewer than N results. Do not silently refill
with unsafe candidates or scan every row to meet the count. Pool size is a
versioned server-side tuning value, not a client-controlled parameter.

Capacity is intentionally checked live, not maintained as a potentially stale
counter. The base indexes cover both block directions, membership directions,
pending requests `(user_id,team_id)`, and pending invites
`(invited_user_id,team_id)`. Inspect existing equivalent index definitions before
adding duplicates; matching names alone do not validate index structure.

This design targets p95 <50 ms of database execution at 100k profiles/20k teams.
It cannot guarantee this across Supabase compute tiers, connection concurrency,
cache states, bloated tables, unusually large rosters, or huge block lists.
Measure both execution latency and retrieval quality before shipping.

## Feature maintenance and deployment

Profile changes rebuild their feature row and teams they belong to or own.
Roster changes rebuild affected teams; team skills, roles, college, owner,
and recruiting changes refresh the team projection/feed. Deletes cascade from
the base entities; member delete triggers refresh surviving teams.

Team rebuilds lock the team row to serialize rollup writers. Triggers use
current READ COMMITTED reads after acquiring that lock. Multi-row transactions
can still deadlock through different base-row lock orders: mutation callers
must retry PostgreSQL 40P01/40001 where appropriate; do not suppress failures.
Benchmark write latency and hot-team contention, not only recommendation reads.

Taxonomy changes require a complete affected-feature rebuild and feed refresh
in the same version transition. Do not edit role definitions while leaving
cached vectors on a previous mapping. V1 is deliberately a frozen seed version.
For more frequent taxonomy updates, build a shadow feature version and switch
atomically rather than relaxing eligibility or returning mixed-version scores.

The provided transaction is suitable for staging or a maintenance window.
For live adoption, Antigravity should split it into:

1. Prepare the private schema, helpers, indexes, and maintenance triggers.
2. Backfill features in controlled batches, with per-profile/team serialization
   against concurrent edits. Compare feature counts and recomputed samples.
3. Deploy temporary uniquely named v2 RPCs and update/regenerate frontend types.
4. Switch callers and verify all surfaces; retire the old signatures after the
   coordinated cutover. Retain the old body separately as a rollback reference.

The draft drops the old `(uuid,integer)` builder signature because its return
contract changes, then creates `(uuid,integer,boolean)` with a default college
preference. Do not leave overloaded defaults that make PostgREST calls
ambiguous. No `DROP ... CASCADE` is used. If SQL dependents exist, adoption must
inspect and migrate them rather than silently deleting them.

Existing base-table RLS/GRANTs are not changed. The only new table permissions
belong to newly introduced private tables, which currently have no app query
consumers. If adoption changes existing table permissions, first perform the
AGENTS.md full query/column inventory; the current draft does not authorize
skipping that requirement. Regenerate `src/types/supabase.ts`, which currently
lags at least the `year_of_study` column.

## TypeScript contract and caller handoff

```ts
type RecommendationArgs = {
  p_user_id: string;
  p_limit?: number;
  p_prefer_same_college?: boolean;
};

type BuilderComponents = {
  complementarity: number | null;
  foundation: number | null;
  experience: number | null;
  context: number;
};

type TeamComponents = {
  role_gap: number | null;
  skill_fit: number;
  novelty: number | null;
  foundation: number | null;
  context: number;
};

type MatchMetadata<T> = {
  compatibility: number; // 0..100 fit index
  confidence: number;    // 0..1 evidence coverage
  components: T;
  reasons: string[];
  score_version: string;
  same_college: boolean;
};

type BuilderRecommendation = MatchMetadata<BuilderComponents> & {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  college: string | null;
  bio: string | null;
  skills: string[] | null;
  github_url: string | null;
  linkedin_url: string | null;
  year_of_study: string | null;
  is_available: boolean | null;
  shared_skills: string[]; // canonical keys
};

type TeamRecommendation = MatchMetadata<TeamComponents> & {
  id: string;
  name: string;
  description: string | null;
  college: string | null;
  skills: string[] | null;
  roles_needed: string[] | null;
  hackathon_id: string | null;
  hackathon_name: string | null;
  max_members: number;
  member_count: number;
  matched_role: string | null;
};

// After regenerating Supabase Database types:
type RecommendedBuildersRpc =
  Database['public']['Functions']['get_recommended_teammates'];
type RecommendedTeamsRpc =
  Database['public']['Functions']['get_recommended_teams'];

const { data, error } = await supabase.rpc('get_recommended_teammates', {
  p_user_id: sessionUser.id,
  p_limit: 10,
  p_prefer_same_college: preferSameCollege,
});
if (error) {
  console.error('Matchmaking RPC failed', error);
  throw error; // Caller presents a retryable error state, not an empty directory.
}
```

Supabase generates JSONB as `Json`; validate `components` against these shapes
at the application boundary instead of blindly casting arbitrary JSON. The
browser may format scores and reasons but must not recalculate ranking.

Specific caller changes:

- `src/app/dashboard/page.tsx`: consume new metadata and intentional discovery
  rendering; keep the same-college section's purpose explicit.
- `src/app/developers/page.tsx`: retire the independent Jaccard calculator.
- `src/lib/matchReasoning.ts`: retire conflicting taxonomies and generated
  claims such as guaranteed execution; use deterministic RPC reasons.
- `/teams`: present recommended teams separately from the complete searchable
  directory. These top-N RPCs are not replacements for full-directory pagination.

The two RPCs intentionally do not implement all directory search filters. Do
not fetch 50 recommendations and present client-side filtering as a complete
search. If search/year/event filters are added to recommendations, put them
before scoring and maintain indexed retrieval for them.

No hackathon compatibility is inferred from names. The repository has a
`team_hackathons` relation in addition to the legacy single `hackathon_id`;
future event-specific eligibility/retrieval should use canonical event IDs and
that relationship. Current scores do not claim compliance with SIH rules.

## Verification and release acceptance

`verify_draft.py` creates a disposable local PostgreSQL cluster, inserts only
fictitious entities, compiles the complete SQL, exercises authenticated-role
access and eligibility/scoring cases, then stops and deletes the cluster in a
`finally` block. It does not read application credentials or connect to Supabase.

```
python docs/architecture/matchmaking-v2/verify_draft.py
python docs/architecture/matchmaking-v2/verify_draft.py --benchmark
```

The benchmark fixture reaches 100,000 profiles and 20,000 teams. It bulk-loads
synthetic features with trigger maintenance temporarily disabled ONLY in the
disposable test database; small behavior fixtures exercise the actual triggers.
Read timings therefore do not measure backfill or mutation throughput. Its
default mix has simple rosters and repeated skill patterns; 20 warmup calls per surface
are excluded and 100 timed calls remain. It measures inside PostgreSQL using
`clock_timestamp`, without client networking. Local numbers are a sanity check,
not the required Supabase p95 acceptance result. See VALIDATION.md for results.

Antigravity's release gate:

- Test spoofed/null viewer IDs, anonymous execution, disabled/banned viewers,
  bidirectional builder blocks, blocked owner/member, both pending-table paths,
  full/non-recruiting teams, existing member/owner, missing capacity, and
  rejected/accepted historical requests that should not exclude results.
- Test duplicates/aliases, unknown-only profiles, null availability, ambiguous
  colleges, every canonical role, fullstack conjunction, existing-role
  vacancies, deleted members, changed owner, and updates while requests race.
- Test both RPC limit defaults/clamps and ranking stability within a UTC day.
- Benchmark p50/p95/p99 with realistic 4–6-person rosters, blocks, pending rows,
  cold and warm caches, skewed popular domains, write contention, and expected
  concurrent load on the actual Supabase tier. Inspect nested query plans
  with EXPLAIN (ANALYZE, BUFFERS), including prepared/generic-plan behavior.
- On a frozen representative evaluation snapshot, exhaustively score all
  eligible candidates offline using these same formulas, then compare the
  bounded retrieval's recall@10 and score regret. Measure separately for
  cold-start, rare-role, multi-role, and college-preference cohorts. Proposed
  initial recall@10 gate: 0.90, counting equal-score alternatives as equivalent;
  this target is a product proposal, not a measured result.
- Tune pool size or add indexed skill/experience retrieval channels if quality
  fails. Do not claim global top-N or trade away safety to meet latency.
- Track application/connection acceptance and sustained membership as later
  outcome signals; use randomized exposure for unbiased calibration. Clicks
  alone are not evidence of successful teams.
- Run `npx tsc --noEmit`, `node scripts/smoke-test-core-pages.js`, and manual
  click-through of `/dashboard`, `/developers`, `/teams`, `/teams/[id]`, plus
  the full required core-page list whenever permissions are affected. Verify
  visitor-safe buttons and visible, logged error states. Build success alone
  is not runtime verification.

## References

- PostgreSQL function security, return-type changes, and default EXECUTE:
  https://www.postgresql.org/docs/16/sql-createfunction.html
- Supabase database functions and safe search paths:
  https://supabase.com/docs/guides/database/functions
- B-tree ordered retrieval and LIMIT behavior:
  https://www.postgresql.org/docs/16/indexes-ordering.html

Weights, thresholds, taxonomy specificity, cohort gates, and score examples
are this design's proposed product heuristics, not claims established by those
documentation sources.
