# HackerMate

HackerMate is a Next.js and Supabase workspace for discovering hackathons,
meeting compatible builders, forming teams, and collaborating through direct
and team messaging.

## Requirements

- Node.js 20 or newer
- A Supabase project
- Supabase CLI when applying database migrations
- Google OAuth enabled in Supabase Auth

## Local setup

Copy the required public Supabase values into `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Install dependencies and start the app:

```bash
npm install
npm run dev
```

The application is available at `http://localhost:3000`.

## Database security

The frontend expects the transactional RPCs and row-level security policies in
[`supabase/migrations/202607020001_core_security.sql`](supabase/migrations/202607020001_core_security.sql).
Apply them before using team, connection, or messaging features:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

Back up an existing database first. The security migration replaces legacy
policies on HackerMate tables so permissive policies cannot remain active.

## Validation

```bash
npm run lint
npm run build
```

Hackathon import utilities live in `scripts/`. The direct seeder requires a
Supabase service-role key supplied at execution time; never store that key in
the repository.
