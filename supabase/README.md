# Supabase changes

Historical migrations in this repository do not all represent the production
ledger. Never apply this directory as a backlog. Confirm the target project,
effective schema, ledger and recoverable backup, then execute only individually
reviewed migrations in their documented order.

For NexHack, use [the release evidence and runbook](../docs/architecture/nexhack-release.md).
Only `202610060002`, `202610060003`, and `202610060004` belong to this release.
Deploy compatible frontend reads between 003 and restrictive 004. The existing
`202610060001` admin deletion repair belongs to the production baseline.
