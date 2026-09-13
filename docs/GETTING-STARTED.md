<!-- generated-by: gsd-doc-writer -->
# Getting Started

This guide walks you through setting up HackerMate locally for the first time. Follow these steps to clone the repository, configure your Supabase backend, install dependencies, and boot the development server.

---

## Prerequisites

Before running HackerMate, ensure you have the following tools and runtimes installed:

- **Node.js**: `Node.js >= 20.0.0` (LTS recommended)
- **Package Manager**: `npm >= 10.0.0`
- **Git**: Latest version
- **Supabase Account & CLI**: A live Supabase project ([supabase.com](https://supabase.com)) with PostgreSQL and Auth enabled, plus the Supabase CLI installed locally:
  ```bash
  npm install -g supabase
  ```

---

## Installation Steps

### 1. Clone the Repository
Clone the HackerMate source code to your local machine:
```bash
git clone https://github.com/your-username/HackerMate.git
cd HackerMate/frontend
```

### 2. Install Project Dependencies
Install all required Node.js packages:
```bash
npm install
```

### 3. Configure Local Environment Variables
Create a `.env.local` file inside the `frontend/` directory with your Supabase credentials:
```bash
# In frontend/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-id>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-public-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```
*(Refer to [CONFIGURATION.md](CONFIGURATION.md) for optional keys like Resend, PostHog, or Gemini.)*

### 4. Apply Database Migrations
HackerMate relies on 66 version-controlled SQL migrations located in `frontend/supabase/migrations/`. Link your project and apply all schema tables, RLS policies, and stored procedures:
```bash
# Login and link to your Supabase project
supabase login
supabase link --project-ref <your-supabase-project-id>

# Apply all database migrations
supabase db push
```

---

## First Run

Launch the Next.js local development server:

```bash
npm run dev
```

Once the server boots, navigate to **[http://localhost:3000](http://localhost:3000)** in your browser.

1. Click **Sign In** on the landing page and authenticate using GitHub or Google OAuth.
2. Complete the 3-step onboarding flow (`/onboarding`) by selecting your college, specifying your hackathon experience level, and adding primary technical skills.
3. Upon submission, you will be redirected to the main builder dashboard (`/dashboard`).

---

## Common Setup Issues

### 1. Missing Supabase Environment Variables
- **Symptom**: Browser shows `Error: NEXT_PUBLIC_SUPABASE_URL is required` or failed API calls with `Invalid URL`.
- **Solution**: Verify that `frontend/.env.local` exists and contains valid values for `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Restart `npm run dev` after editing `.env.local` because Next.js loads environment variables at startup.

### 2. Supabase RLS Policy Violation (Code `42501`)
- **Symptom**: Console outputs `🚨 [Supabase RLS Policy Violation] • Error Code: 42501 (Insufficient Privilege)` when loading profiles or team data.
- **Solution**: Your database lacks the required Row-Level Security policies or stored procedures. Run `supabase db push` to ensure all 66 migrations in `frontend/supabase/migrations/` have been executed against your database.

### 3. Port `3000` Already in Use
- **Symptom**: Next.js logs `Port 3000 is in use, trying 3001 instead`.
- **Solution**: Either terminate the existing process occupying port 3000 or explicitly bind Next.js to an alternate port:
  ```bash
  npm run dev -- -p 3001
  ```

---

## Next Steps

Now that your local environment is running, explore these companion guides:
- [**Development Guide**](DEVELOPMENT.md) — Coding standards, build scripts, branch rules, and pull request workflow.
- [**Testing Guide**](TESTING.md) — Running smoke tests, type checking, and verifying database security policies.
- [**Architecture Overview**](ARCHITECTURE.md) — Deep dive into system components, data flows, and abstractions.
