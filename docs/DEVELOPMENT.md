<!-- generated-by: gsd-doc-writer -->
# Development Guide

This document outlines local development conventions, available build and linting commands, code style requirements, and pull request workflows for contributing to HackerMate.

---

## Local Setup

1. **Fork or Clone**: Clone the repository and change directory to `frontend/`:
   ```bash
   git clone https://github.com/your-username/HackerMate.git
   cd HackerMate/frontend
   ```
2. **Install Packages**: Install dependencies using `npm install` (do not use `npm ci` for local development when adding new dependencies).
3. **Environment Setup**: Copy and configure your `.env.local` file with working Supabase development credentials:
   ```bash
   cp .env.example .env.local
   ```
4. **Boot Development Environment**: Run `npm run dev` to boot the Next.js development server with Turbopack and the custom RLS error interceptor enabled.

---

## Build & Verification Commands

All standard scripts are defined in `frontend/package.json`:

| Command | Working Directory | Description |
| :--- | :--- | :--- |
| `npm run dev` | `frontend/` | Starts the Next.js 16 development server on `http://localhost:3000`. |
| `npm run build` | `frontend/` | Compiles the production application bundle and validates static page generation. |
| `npm run start` | `frontend/` | Runs the compiled production application server. |
| `npm run lint` | `frontend/` | Executes ESLint 9 using Next.js core Web Vitals rules. |
| `npm run typecheck` | `frontend/` | Runs `tsc --noEmit` across all TypeScript files. Must pass with 0 errors. |
| `node scripts/smoke-test-core-pages.js` | `frontend/` | Executes automated smoke-testing against live core routes to verify RLS permissions. |

---

## Code Style & Standards

HackerMate maintains strict engineering and design conventions enforced across all components and pages:

### 1. Visual Design & Icon Standards
- **Prohibited Icons**: Never use `Sparkles`, `Sparkle`, or star/sparkling icons or emojis (`✨`, `⭐`) anywhere in the application. Avoid generic "AI magic" tropes.
- **Approved Domain Icons**: Use purposeful icons matching functional intent:
  - `Zap`: Speed, execution, quick actions
  - `Lightbulb`: Ideas, brainstorming, recommendations
  - `Target`: Accuracy, alignment, benchmarks
  - `Cpu` / `Layers`: Architecture, systems, technical stacks
  - `Building2` / `Handshake`: Partners, organizers, sponsorships
  - `Trophy` / `Award`: Achievements, hackathon winner badges
  - `CheckCircle2`: Validation, verification, success confirmation

### 2. Strict Membership & Access Control Scoping
- **Default-Deny UI Controls**: Any team management action, export control (e.g. `Share Team`, `SPOC Export`), task modification, or internal workspace trigger must be wrapped in explicit membership or ownership authorization checks:
  ```typescript
  const canManage = isMember || isOwner;
  if (!canManage) {
    // Render visitor-safe view or omit action buttons
  }
  ```
- **External Visitor Views**: When non-members or public visitors view team cards, they must ONLY see visitor-safe controls (e.g. `View & Apply →`, `Request to Join`, `Connect`). Management controls must never be rendered to non-teammates.

### 3. Canonical Route Precision
Always use canonical routes when constructing links (`<Link href="...">`) or handling redirects:
- User Profiles: `/profile/[id]` *(never `/builders/[id]` or `/developer/[id]`)*
- Teams: `/teams/[id]`
- Workspaces: `/teams/[id]/workspace`
- Hackathons: `/hackathons/[id]` or `/hackathons/sih`

### 4. Database Safety Rules
- **No Unscoped Wildcards**: Never use `.select('*')` on restricted tables such as `profiles`. Always use explicit column projections (e.g. a shared `SAFE_PROFILE_COLUMNS` constant).
- **Explicit Error Logging**: Never silently convert a database permission or query error into a "not found" or empty-state UI. Log errors (`console.error`) before displaying fallback states.

---

## Branch Conventions

Follow standard Git branching prefixes:

- `feat/feature-name` — New user-facing features or pages
- `fix/bug-description` — Bug fixes or security patches
- `docs/doc-update` — Documentation updates or additions
- `refactor/component-name` — Code restructuring without feature changes
- `perf/optimization-name` — Performance improvements

The default working and deployment branch is `main`.

---

## PR Process

When submitting a pull request to `main`:

1. **Static Validation**: Run `npm run typecheck` and `npm run lint` locally. All checks must pass with zero errors.
2. **Runtime Verification**: If your change touches database schemas, RLS policies, or Supabase queries, execute `node scripts/smoke-test-core-pages.js` to ensure core pages (`/dashboard`, `/profile/[id]`, `/developers`, `/connections`, `/teams`) load cleanly.
3. **Audit Staged Files**: Ensure no accidental test data, `.env.local` credentials, or unapproved dependencies are staged.
4. **Descriptive Summary**: Provide a clear PR description highlighting what changed, why the approach was chosen, and manual verification steps completed.
