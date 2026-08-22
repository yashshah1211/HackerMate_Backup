# HackerMate

**The team-operating system for college hackathons.**

HackerMate helps solo builders find teammates by skill and college, and gives
formed teams a shared workspace — chat, invites, and hackathon-specific
tooling — instead of coordinating across five different apps.

Live at [hackermate.in](https://hackermate.in)

<!--
  Add 2–3 real screenshots here before publishing — landing page, dashboard,
  and a team workspace are the highest-value ones. A README with no visuals
  undersells a live product with this much built.
  ![Dashboard](docs/screenshots/dashboard.png)
-->

---

## What it does

**Builder discovery & matching**
Matches builders by tech stack, skills, role, and college. Browse or search
builders directly, send connection requests with an optional note.

**Team workspaces**
Once a team forms, it gets a shared workspace: real-time team chat and DMs
(via Supabase Realtime), threaded message replies, @mentions, pinned
messages for shared resources, and one-click team invites sent directly in
DMs.

**Partner hackathon portals**
Dedicated branded pages for partner hackathons, with multi-track
registration support for events with separate tracks (AI/ML, Web3, FinTech,
etc.).

**Smart India Hackathon tooling**
College-scoped team formation for SIH, plus SPOC-facing export tools for
validating team rosters.

**Notifications**
In-app notifications for connection requests, team invites, and join
requests, plus scheduled email digests for organizers.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Backend | Supabase (Postgres, Auth, Storage, Realtime) |
| Analytics | PostHog |

*(Check `package.json` for exact pinned versions before quoting them
elsewhere — leaving them out here rather than risk listing stale numbers.)*

---

## Project structure

```
frontend/
├── src/
│   ├── app/                 # Next.js App Router pages and API routes
│   │   ├── admin/           # Admin dashboard
│   │   ├── connections/     # Builder network / connection requests
│   │   ├── dashboard/       # Main user dashboard
│   │   ├── developers/      # Builder search & directory
│   │   ├── hackathons/      # Hackathons index, SIH hub, event details
│   │   ├── invites/         # Pending team invites
│   │   ├── leaderboard/     # Inter-college leaderboard
│   │   ├── messages/        # DMs and inbox
│   │   ├── notifications/   # In-app notifications
│   │   ├── onboarding/      # Profile creation flow
│   │   ├── partners/[slug]/ # Partner hackathon portals
│   │   ├── profile/[id]/    # Public builder profiles
│   │   ├── teams/[id]/      # Team overview and live workspace
│   │   └── api/             # Serverless routes, webhooks, cron jobs
│   ├── components/          # Shared UI components
│   ├── context/             # React context providers
│   ├── lib/                 # Supabase client, helpers, safety filters
│   └── types/                # Database and interface types
└── supabase/
    └── migrations/           # SQL migrations
```

---

## Getting started

### Prerequisites

- Node.js 20+
- npm 10+
- A Supabase project (Postgres + Auth enabled)

### Setup

```bash
git clone https://github.com/yashshah1211/HackerMate_Backup
cd HackerMate/frontend
npm install
```

Create `frontend/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Optional
NEXT_PUBLIC_POSTHOG_KEY=your-posthog-key
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

Never commit real keys — `.env.local` should stay out of version control.
The anon key is safe to expose client-side by design (that's what Postgres
row-level security is for), but it still shouldn't live in the repo or in
this README.

```bash
npm run dev
```

Then open `http://localhost:3000`.

### Database setup

Apply migrations before serving real traffic:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Notable migrations in `frontend/supabase/migrations/`:

- `202607020001_core_security.sql` — core RLS policies and team RPCs
- `202607260001_axcentra_and_partner_engine.sql` — partner portal + multi-track support
- `202608040001_morrow_partner_page.sql` — Morrow 1.0 partner page
- `202608040003_add_reply_to_id_to_messages.sql` — threaded message replies

---

## Security notes

The platform uses Postgres row-level security, default-deny access checks in
the UI layer, and rate-limiting on messaging and team-management endpoints.
Like any actively developed project, that's a continuous process rather than
a finished state — if you find an issue, please report it privately rather
than opening a public issue (see below).

---

## Routes

| Entity | Route | Example |
|---|---|---|
| Profile | `/profile/[id]` | `/profile/44067b2e-...` |
| Team overview | `/teams/[id]` | `/teams/a1b2c3d4-...` |
| Team workspace | `/teams/[id]/workspace` | `/teams/a1b2c3d4-.../workspace` |
| Hackathon | `/hackathons/[id]` | `/hackathons/sih` |
| Partner portal | `/partners/[slug]` | `/partners/morrow` |
| Leaderboard | `/leaderboard` | `/leaderboard?college=vjti` |
| Connections | `/connections` | |
| Invites | `/invites` | |

---

## Validation

```bash
npx tsc --noEmit    # type check
npm run lint         # lint
npm run build        # production build
```

---

## Contributing

<!--
  Fill this in with actual guidance if you want outside contributors —
  right now there's nothing here telling someone how to propose a change,
  what the review process looks like, or what's off-limits (e.g. anything
  touching auth/RLS/schema, per your own internal AGENTS.md workflow).
-->

Contribution guidelines are still being written. If you're interested in
contributing, reach out first rather than opening a PR directly.

---

## License

<!-- Confirm this is accurate — add a LICENSE file if one doesn't exist yet. -->

MIT

---

Built by Yash Shah and the HackerMate team.
