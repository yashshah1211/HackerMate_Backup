<!-- generated-by: gsd-doc-writer -->
# Testing & Quality Assurance Guide

This guide outlines HackerMate's testing strategy, runtime verification harnesses, automated smoke tests, and static analysis workflows.

---

## Test Framework & Setup

HackerMate employs a multi-tiered verification approach:
1. **Static Analysis & Type Checking**: TypeScript compiler (`tsc --noEmit`) in strict mode and ESLint 9 for AST linting and import hygiene.
2. **Static Codebase Query Audit**: Automated regex scanners verifying that no client-side query requests restricted columns (e.g. `email` or unscoped `profiles(*)` wildcards).
3. **Runtime Query Smoke-Test Suite**: An automated test harness (`frontend/scripts/smoke-test-core-pages.js`) that directly executes queries mimicking core pages against the live Supabase database using the public anonymous key.
4. **Specialized Test Harnesses**: Scripts verifying PDF generation, email report rendering, and AI pitch evaluations.

### Prerequisites Before Testing
To execute runtime query tests, ensure `frontend/.env.local` contains valid Supabase public credentials:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-id>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

---

## Running Tests

### 1. Static Type Checking & Linting
Run TypeScript compilation and ESLint across the codebase:

```bash
# Verify TypeScript types (0 errors standard)
npm run typecheck

# Verify ESLint rules
npm run lint
```

### 2. Core Pages Runtime Smoke Test
Execute the automated smoke test from the `frontend/` directory:

```bash
node scripts/smoke-test-core-pages.js
```

**What this script verifies:**
- **Static Audit**: Recursively scans all `.ts` and `.tsx` source files in `src/` to ensure zero instances of forbidden `profiles(*)` wildcards or unshielded `email` field requests.
- **`/dashboard` Query**: Verifies builder compatibility feeds, college peer listings, and active team cards load without 42501 RLS errors.
- **`/profile/[id]` Query**: Tests profile lookups across multiple real and mock user UUIDs, verifying badge and portfolio retrieval.
- **`/developers` Query**: Tests filtered builder searches by skill arrays and college strings.
- **`/connections` Query**: Tests pending and accepted connection request queries.
- **`/teams` & `/teams/[id]` Workspace Join**: Verifies team discovery cards and deep-nested member roster joins (`team_members(user_id, role, profiles(...))`).
- **`/hackathons/sih` Hub**: Verifies Smart India Hackathon problem statements and participating team queries.

### 3. Specialized Feature Harnesses
For testing background services and PDF generation:

```bash
# Test PDF generation and track activity reporting
npx tsx scripts/test_database_activity_report.ts

# Test presentation evaluation scoring engine
npx tsx scripts/test_ppt_evaluator_tracks.ts
```

---

## Writing New Tests & Harnesses

When creating test scripts in `frontend/scripts/`:

### 1. Strict Test Data Scoping & Auto-Cleanup
- **No Real Entity Overwrites**: Never insert, update, or delete production team IDs, real user accounts, or active hackathon submissions.
- **Throwaway Test UUIDs**: Always generate unique throwaway identifiers (e.g. `crypto.randomUUID()`) or use dedicated test records.
- **`try ... finally` Cleanup**: Any script that inserts records into Supabase must wrap database operations in a `try ... finally` block ensuring complete deletion of test data even if an assertion or network call fails:

```typescript
const testTeamId = crypto.randomUUID();
try {
  // Execute test operations
} finally {
  // Always clean up test data
  await supabase.from("teams").delete().eq("id", testTeamId);
}
```

### 2. No Silent Error Suppression
Never catch and ignore database permission errors. All test harnesses must log the exact error message, hint, and error code before failing:
```typescript
if (error) {
  console.error(`❌ Query Failed [${error.code}]: ${error.message}`);
  throw error;
}
```

---

## Coverage Requirements

HackerMate does not configure arbitrary line or branch percentage thresholds:

| Type | Threshold |
| :--- | :--- |
| **Lines** | No coverage threshold configured |
| **Branches** | No coverage threshold configured |
| **Functions** | No coverage threshold configured |
| **Statements** | No coverage threshold configured |

Quality is enforced by a **Zero-Tolerance Invariant Policy**:
- 0 TypeScript compiler warnings or errors (`tsc --noEmit`).
- 0 ESLint warnings or errors (`npm run lint`).
- 0 RLS permission violations (Code `42501`) on core pages.
- 100% pass rate on `node scripts/smoke-test-core-pages.js`.

---

## CI & Deployment Integration

1. **Vercel Build Gate**: On every push and pull request, Vercel automatically runs `npm run build`, which executes static type checking and bundle validation.
2. **Pre-Migration Safety Checklist**:
   - Run codebase sweep for query impact before altering table grants.
   - Apply migration: `supabase db push`.
   - Run `node scripts/smoke-test-core-pages.js`.
   - Manually verify runtime behavior on `/dashboard`, `/profile/[id]`, and `/teams`.
