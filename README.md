# ⚡ HackerMate Frontend & Workspace

This directory contains the Next.js 16 App Router application and Supabase database migrations for **HackerMate** — the Operating System for Hackathon Teams & Builders.

For full project documentation, architecture diagrams, and canonical routing matrix, please see the [Root README](../README.md).

## 🚀 Local Development

### 1. Environment Setup

Copy `.env.example` (or create `.env.local`):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 2. Install & Run

```bash
# Install dependencies
npm install

# Start Next.js development server
npm run dev
```

App will run locally at [http://localhost:3000](http://localhost:3000).

## 🗄️ Database Migrations

Apply transactional database migrations located in `supabase/migrations/`:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

## 🧪 Validation Commands

```bash
# TypeScript typecheck
npx tsc --noEmit

# Linting
npm run lint

# Production build test
npm run build
```
