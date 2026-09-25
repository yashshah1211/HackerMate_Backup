# SQL reference validation

Date: 2026-09-25. Target: isolated local PostgreSQL 18.4 on Windows x64.
No production/Supabase connections, credentials, or records were used.

Final command:

```
python docs/architecture/matchmaking-v2/verify_draft.py --benchmark
```

The final complete SQL compiled and all included behavioral assertions passed.
Checks exercised:

- authenticated builder/team RPC execution with no direct private-schema access;
- rejection of identity spoofing and an absent authenticated identity;
- anonymous EXECUTE denied and private schema USAGE denied;
- default, negative, and oversized builder result limits;
- complementary backend ranked ahead of identical frontend evidence;
- deterministic UUID tie-breaks;
- alias deduplication and whitespace normalization;
- Python alone not counted as AI/ML;
- identical partial domain vectors have zero novelty;
- missing foundations and legacy default-zero experience remain unknown;
- foundation bitsets preserve an exact one-foundation intersection;
- self, incoming/outgoing blocks, bans, and incomplete onboarding excluded;
- explicit frontend vacancy receives full readiness;
- frontend-only evidence does not satisfy a full-stack vacancy;
- non-recruiting/full teams, existing membership/ownership, pending requests,
  pending invitations, blocked members, and blocked owners excluded;
- profile updates refresh affected team features.

Read benchmark data: exactly 100,000 fictitious profiles and 20,000 fictitious
teams. Twenty warmup requests per surface, followed by 100 timed requests per
surface, sequentially. Server-side wall time measured using clock_timestamp.

| Surface | p50 | p95 | Maximum |
|---|---:|---:|---:|
| Builder to builder | 38.03 ms | 42.36 ms | 46.39 ms |
| Builder to team | 14.27 ms | 16.20 ms | 18.35 ms |

The total final benchmark phase, including optimized fixture load, took 19.0s.
The runner stopped and removed its temporary PostgreSQL cluster in finally.

Before optimization, the same bounded-pool approach measured 72.94 ms builder
p95 and 23.01 ms team p95. Inlineable scalar arithmetic plus cached foundation
bitsets improved the final path without reducing its candidate-pool sizes.

These measurements do NOT establish production p95, concurrent-load capacity,
retrieval recall, statistical outcome calibration, or frontend correctness.
The fixtures repeat a small set of skill patterns and mostly use one-member
teams. Feature data is bulk-loaded for this read benchmark; full trigger-driven
bulk loading was slow and was intentionally cancelled, so the benchmark must
not be cited as evidence of backfill or write throughput.

Still required for release: realistic Supabase benchmarking, recall evaluation,
contention/race tests, migration integration, regenerated TypeScript contracts,
core-page smoke tests, and manual visitor/member runtime verification. Those
remain Antigravity's implementation/release work, not completed by this handoff.
