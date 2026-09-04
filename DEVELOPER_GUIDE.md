# HackerMate Developer Setup & Workflow Guide

Welcome to the team! This guide outlines the setup procedures, database integrations, and collaboration workflows for the HackerMate repository.

---

## 1. Local Quickstart Setup

### Step 1: Install Prerequisites
Ensure the following software packages are installed on your local machine:
* **Git:** For cloning, branches, and pushing.
* **Node.js (v20 or newer):** The Next.js runtime environment (includes npm).
* **VS Code:** Recommended editor (configured with ESLint and TypeScript).

```bash
# Verify your local versions
git --version
node -v
npm -v
```

### Step 2: Clone the Repository
Clone the project repository to your workspace and navigate to the project directory:
```bash
git clone <GITHUB_REPO_URL>
cd HackerMate_Backup
```

### Step 3: Install Dependencies
Restore the package node modules specified in the workspace `package.json` manifest:
```bash
npm install
```

### Step 4: Create Environment File
Create a local environment file named `.env.local` in the root folder. Paste the configuration secrets provided by the team administrator:
```env
# Public Supabase Access
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Server-Side Configuration (Never expose to client)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
CRON_SECRET=your_secure_cron_secret
RESEND_API_KEY=re_your_resend_api_key
```

> [!WARNING]
> **Security Warning:** Never commit `.env.local` to GitHub. This file contains service-role API credentials that bypass Row-Level Security (RLS). It is already listed in `.gitignore`.

---

## 2. Supabase Integration & Database Schema

### Step 5: Apply Database Migrations
The messaging, matchmaking, and team collaboration features require custom Row-Level Security (RLS) policies, triggers, and RPC functions maintained inside `supabase/migrations/`. 

Apply them by linking the Supabase CLI directly to your project reference:
```bash
# 1. Link your local directory to your Supabase Project
supabase link --project-ref <project-ref>

# 2. Push database schema, RPCs, and RLS policies
supabase db push
```

> [!IMPORTANT]
> **Database Backup Alert:** Always back up your active staging database before executing a database push. Migrations replace active security policies on tables.

### Step 6: Enable Google & GitHub OAuth
HackerMate uses Google and GitHub OAuth providers for secure developer registration:
1. Open your **Supabase Dashboard** and navigate to <strong>Authentication > Providers</strong>.
2. Enable **Google** and **GitHub**.
3. Enter the Client IDs and Secrets generated from Google Developer Console and GitHub Settings.
4. Ensure the Redirect URL matches your environment: `http://localhost:3000`.

### Step 7: Seed Hackathon Data
To test hackathon search and teammate matching features locally, populate the database tables with crawled hackathon information:
```bash
# Run the local SQL seed using Supabase Dashboard SQL Editor or terminal
psql -d "postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres" -f seed_unstop_hackathons.sql
```

### Step 8: Spin Up the Server
Start the local Next.js development server to verify setup:
```bash
npm run dev
```
Open `http://localhost:3000` in your browser. Complete the user onboarding flow (adding your skills, GitHub statistics, and college selection) to confirm successful connection.

---

## 3. Daily Development Workflow

Maintain repository consistency by executing these Git steps during daily development sessions:

```bash
# 1. Pull changes before beginning a session
git pull origin main

# 2. Compile and test changes locally
npm run lint
npm run build

# 3. Commit and push contributions
git add .
git commit -m "feat: descriptive message of your modifications"
git push origin main
```

---

## 4. Troubleshooting Guide

### If `npm install` Fails
Clear your local lockfiles and node module caching, then retry installation:
```bash
rm -rf node_modules package-lock.json
npm install
```

### If Server Fails to Launch
Double-check environment variables in `.env.local`. If Database errors occur, verify migrations are up-to-date.

### OAuth Sign-in Redirect Failures
Ensure the callback URL configuration matches in the provider console (e.g. Google Cloud or GitHub OAuth developer app redirects).

### Cron Reminders Blocked
Verify the `CRON_SECRET` header matches the token passed by the server request. Ensure `RESEND_API_KEY` is correctly loaded.

---

## 5. Core Development Rules
* **Lint First:** Never push code that breaks `npm run lint` or `npm run build`.
* **Coordinate Database Changes:** Coordinate with the backend team before pushing modifications in `supabase/migrations/`.
* **Mock Notifications:** In sandbox developer environments, email notifications redirect automatically to your sandbox recipient to prevent production spam.
