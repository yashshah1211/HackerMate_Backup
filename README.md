# HackerMate

**Team Operating System for Hackathons**

Find teammates who actually ship. Match with builders by skill and track
record, form a team with every gap covered, then build, review your pitch,
and submit — all from one workspace.

**570+ builders active** · Live at [hackermate.in](https://hackermate.in)

<!--
  TODO: Add 2–3 screenshots — landing page, builder search, and team
  workspace are the highest-value ones.
  ![Dashboard](docs/screenshots/dashboard.png)
-->

---

## What it does

### Builder Discovery & Smart Matching

Search by the skill you're missing, not by who replies first. Browse and
filter builders by tech stack (React, Figma, AI/ML, …), college, role, and
verified track record. AI-powered recommendations surface the best fits.
The matchmaking engine (now at v3) scores compatibility across skills,
interests, and experience. Send connection requests with an optional note,
or use the Smart Gap Filler to find exactly the skill your team is missing.

### Team Workspaces

Once a team forms it gets a shared workspace with:

- **Real-time chat** (Supabase Realtime) with threaded replies, @mentions,
  and emoji reactions
- **Pinned messages** for shared resources and links
- **Voice notes** — record and share audio messages
- **One-click team invites** sent directly in DMs
- **Daily visit streaks** and gamification to keep teams active
- **Pitch review** — AI-powered PPT evaluation and analysis before submission

### Partner Hackathon Portals

Dedicated branded pages for partner hackathons — each with multi-track
registration, organizer dashboards, and CSV export tooling:

| Partner | Highlights |
|---|---|
| **Hustle Carnival** | Multi-phase pipeline: Phase 1 shortlisting → Phase 2 workshops → Round 2 delivery + auto-dispatch |
| **CraftNCode** | National partner hub with state-level pages |
| **Rack It Up 2026** | Branded portal with conversion-funnel tracking |
| Generic portals | Any organizer can get a `/partners/[slug]` page with registration + team tooling |

### Expo Mode

On-site hackathon tooling: judge scoring interface, live leaderboard, and a
full set of printable materials (posters, flyers, QR signs, team mats, rules
cards, challenge sheets, and a builder directory).

### Smart India Hackathon Tooling

College-scoped team formation for SIH, plus SPOC-facing export tools for
validating team rosters.

### Certificate Verification

Verifiable hackathon participation certificates with unique IDs and a public
verification page at `/verify/[id]`.

### Campus Leaderboard

Inter-college leaderboard ranking campuses by builder activity, team
formation, and hackathon participation.

### Admin Dashboard

Founder-facing admin panel with:

- User moderation (ban, delete, badge management)
- Organizer lead CRM (track outreach, sync Gmail replies, update status)
- Partner portal configuration
- Hackathon approval workflow
- Email delivery analytics
- Database activity reports
- Attention queue for high-priority actions

### Notifications & Email

In-app notification bell for connection requests, team invites, and join
requests. Scheduled email digests for organizers. Email delivery tracking
with open-rate analytics via Resend webhooks.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.4 (App Router) |
| Language | TypeScript 5 |
| Runtime | React 19 |
| Styling | Tailwind CSS 4 |
| Backend / Database | Supabase (Postgres, Auth, Storage, Realtime) |
| Hosting | Vercel (serverless + edge crons) |
| Auth | Supabase Auth — Google & GitHub OAuth |
| Analytics | Simple Analytics, Google Analytics, Vercel Analytics, PostHog |
| Error Tracking | Sentry (client + server + edge) |
| File Storage | AWS S3 + Cloudflare R2 (presigned uploads) |
| Email | Resend + Svix webhooks |
| Animations | Motion (Framer Motion) |
| PDF | jsPDF (generation), unpdf (extraction) |
| AI | Google Gemini (matching, moderation, PPT evaluation) |
| Chat Bot | Discord (slash commands, TweetNaCl verification) |
| E2E Testing | Playwright 1.64 |

---

## Project structure

```
HackerMate_Backup/
├── src/
│   ├── app/                        # Next.js App Router — 26 route groups
│   │   ├── admin/                  # Admin dashboard, moderation, attention queue
│   │   ├── api/                    # 49 serverless routes, webhooks, 7 cron jobs
│   │   ├── auth/callback/          # OAuth callback handler
│   │   ├── connections/            # Builder network
│   │   ├── contact/                # Contact form
│   │   ├── dashboard/              # Main user dashboard
│   │   ├── dev/v2/                 # V2 prototypes (builders, workspace-live)
│   │   ├── developers/             # Builder search & directory
│   │   ├── expo/                   # Expo mode — judging, leaderboard, printables
│   │   ├── faq/                    # FAQ
│   │   ├── hackathons/             # Hackathon index, details, organizer tools
│   │   ├── invites/                # Pending team invites
│   │   ├── leaderboard/            # Inter-college leaderboard
│   │   ├── login/                  # Auth entry point
│   │   ├── messages/               # DMs and inbox
│   │   ├── my-teams/               # User's team list
│   │   ├── notifications/          # In-app notifications
│   │   ├── onboarding/             # Profile creation flow
│   │   ├── partners/               # Partner hackathon portals (Hustle, CraftNCode, …)
│   │   ├── profile/[id]/           # Public builder profiles + edit
│   │   ├── settings/               # User settings
│   │   ├── teams/[id]/             # Team overview, workspace, requests, dashboard
│   │   ├── tools/ppt-evaluator/    # PPT evaluation tool
│   │   └── verify/[id]/            # Certificate verification
│   ├── components/
│   │   ├── auth/                   # AuthGuard
│   │   ├── hackathons/             # HackathonCard, filters
│   │   ├── landing/                # Hero, Features, HowItWorks, Stats, Partners, CTA
│   │   ├── onboarding/             # OnboardingForm
│   │   ├── partners/               # Partner portal shells and dashboards
│   │   ├── settings/               # SettingsForm
│   │   ├── shell/                  # AppShell, Sidebar, TopBar, MobileNav, BottomNav
│   │   ├── system/                 # PostHog, Sentry, Vercel Analytics providers
│   │   ├── ui/                     # Button, Card, Badge, Modal, Input, Tabs, Avatar, …
│   │   └── workspace/              # Chat, threads, reactions, pinned messages, members
│   ├── context/                    # React context providers
│   ├── lib/
│   │   ├── admin/                  # Dashboard data, moderation, attention queue
│   │   ├── ai/                     # Gemini AI client (matching, moderation, evaluation)
│   │   ├── auth/                   # Session helpers, guards, return-path hardening
│   │   ├── evaluator/              # Challenge & PPT evaluation engine
│   │   ├── hackathons/             # Hackathon data fetching & filtering
│   │   ├── hustle-phase2/          # Hustle Carnival Phase 2 pipeline
│   │   ├── net/                    # Link preview, rate limiting
│   │   ├── partners/               # Partner portal data layer
│   │   ├── ppt/                    # Presentation processing
│   │   ├── supabase.ts             # Supabase client (browser + server)
│   │   ├── safety.ts               # Content safety filters
│   │   ├── email.ts                # Email utilities (Resend)
│   │   ├── badges.ts               # Badge management
│   │   ├── discord.ts              # Discord bot integration
│   │   ├── certificates.ts         # Certificate generation & verification
│   │   └── s3.ts                   # S3 presigned upload helpers
│   └── types/                      # Database and interface type definitions
├── supabase/
│   ├── migrations/                 # 159 SQL migrations
│   └── rollback/                   # Rollback scripts
├── scripts/                        # 130+ test harnesses & utilities
├── qa/browser/                     # Playwright E2E tests (safety, fixture, live)
├── docs/                           # Architecture docs, QA reports, operational runbooks
│   ├── architecture/               # 20 architecture decision docs + matchmaking design
│   ├── hustle-launch-rehearsal/    # Launch rehearsal playbook
│   ├── plans/                      # Planning & remediation docs
│   ├── qa/                         # QA reports with before/after screenshots
│   └── sql/                        # Pre/postflight SQL scripts
├── public/                         # Static assets, logos, partner branding
└── .github/workflows/              # CI: PR validation, analytics, DB reports
```

---

## Routes

| Page | Route | Description |
|---|---|---|
| Landing | `/` | Hero, features, stats, partner logos |
| Builder search | `/developers` | Search by skill, college, availability |
| Profile | `/profile/[id]` | Public builder profile with track record |
| Edit profile | `/profile/edit` | Edit your own profile |
| Dashboard | `/dashboard` | Personalized home — teams, activity, suggestions |
| My teams | `/my-teams` | All teams you belong to |
| Team overview | `/teams/[id]` | Team info, members, hackathon link |
| Team workspace | `/teams/[id]/workspace` | Real-time chat, threads, pinned messages |
| Team requests | `/teams/[id]/requests` | Pending join requests for team owners |
| Team dashboard | `/teams/[id]/dashboard` | Team stats and management |
| Create team | `/teams/create` | Start a new team |
| Hackathons | `/hackathons` | Browse upcoming hackathons |
| Hackathon detail | `/hackathons/[id]` | Event info, tracks, registration |
| Organizer view | `/hackathons/[id]/organizer` | Organizer dashboard for their event |
| Partner portal | `/partners/[slug]` | Branded partner hackathon page |
| Partner organizer | `/partners/[slug]/organizer` | Partner-side management |
| Connections | `/connections` | Builder network & requests |
| Messages | `/messages` | DMs and inbox |
| Invites | `/invites` | Pending team invites |
| Notifications | `/notifications` | In-app notifications |
| Leaderboard | `/leaderboard` | Inter-college leaderboard |
| Expo | `/expo` | On-site expo mode |
| Expo judging | `/expo/judge` | Judge scoring interface |
| Expo leaderboard | `/expo/leaderboard` | Live expo scores |
| Certificate verify | `/verify/[id]` | Verify a participation certificate |
| PPT evaluator | `/tools/ppt-evaluator` | AI-powered presentation feedback |
| Onboarding | `/onboarding` | New user profile creation |
| Settings | `/settings` | Account settings |
| Admin | `/admin` | Admin dashboard (authorized users only) |
| Login | `/login` | Sign in via Google or GitHub |
| FAQ | `/faq` | Frequently asked questions |
| Contact | `/contact` | Contact form |
| Privacy | `/privacy` | Privacy policy |
| Terms | `/terms` | Terms of service |

**Redirects** (configured in `next.config.ts`):
`/builders` → `/developers`, `/builders/:id` → `/profile/:id`,
`/developer/:id` → `/profile/:id`, `/team/:id` → `/teams/:id`,
`/hackathon/:id` → `/hackathons/:id`

---

## Cron jobs

Three cron jobs are configured in `vercel.json`:

| Job | Schedule | Route |
|---|---|---|
| Hustle Round 2 (one-shot) | Oct 23 00:45 UTC | `/api/cron/hustle-round2-once` |
| Database activity report | Daily 3:30 AM UTC | `/api/cron/database-activity-report` |
| Auto-scrape leads | Daily 3:30 AM UTC | `/api/cron/auto-scrape-leads` |

Additional cron endpoints exist in `src/app/api/cron/` and can be
triggered manually or added to `vercel.json` as needed:
`reminders`, `onboarding-nudge`, `profile-nudges`, `daily-email-report`,
`analytics-summary`.

---

## Getting started

### Prerequisites

- Node.js 20+
- npm 10+
- A Supabase project (Postgres + Auth enabled)

### Setup

```bash
git clone https://github.com/yashshah1211/HackerMate_Backup
cd HackerMate_Backup
npm install
```

Create `.env.local` (see [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) for the
full list of env vars):

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional — enable as needed
CRON_SECRET=your-cron-secret
RESEND_API_KEY=your-resend-key
GEMINI_API_KEY=your-gemini-key
SENTRY_DSN=your-sentry-dsn
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
DISCORD_APPLICATION_ID=your-discord-app-id
DISCORD_PUBLIC_KEY=your-discord-public-key
DISCORD_BOT_TOKEN=your-discord-bot-token
```

Never commit real keys — `.env.local` is git-ignored. The Supabase anon key
is safe to expose client-side by design (that's what Postgres row-level
security is for), but it still shouldn't live in the repo.

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

The `supabase/migrations/` directory contains 159 migrations covering core
RLS policies, the partner portal engine, matchmaking (v1 → v2 → v3),
real-time chat, expo scoring, certificate verification, and more.

---

## Validation

```bash
npx tsc --noEmit          # Type check
npm run lint               # Lint
npm run build              # Production build
npm run test:ppt           # PPT evaluator tests
npm run test:matching      # Squad matching tests
npm run test:matching:sql  # Squad matching SQL tests (Python)
npm run test:browser       # Playwright E2E (safety + fixture suites)
npm run test:browser:live  # Playwright E2E against live site
```

130+ additional test harnesses in `scripts/` cover individual features.
See `scripts/test-*.cjs` for the full list.

---

## Security

- **Postgres Row-Level Security** — all tables have default-deny RLS
  policies; 159 migrations include multiple hardening passes
- **Auth return-path hardening** — prevents open-redirect attacks on
  OAuth callbacks
- **Content safety filters** — profanity and abuse filtering on
  user-generated content (`lib/safety.ts`)
- **Rate limiting** — enforced on messaging, team management, and
  connection request endpoints
- **SQL security hardening** — dedicated migration passes for function
  privileges, RLS initplan optimization, and definer-rights lockdown
- **Admin authorization** — admin routes require explicit role checks;
  partner organizer routes are scoped to their own portal
- **Sentry error tracking** — client, server, and edge configs with
  source-map upload (maps hidden from client bundles)

If you find a security issue, please report it privately rather than
opening a public issue.

---

## CI / GitHub Actions

| Workflow | Trigger | Purpose |
|---|---|---|
| `pr-validation.yml` | Pull requests | Type check, lint, build |
| `analytics-digest.yml` | Scheduled | Weekly analytics summary |
| `daily-database-report.yml` | Scheduled | Daily DB activity digest |
| `rack-portal-qualification.yml` | On demand | Rack It Up portal QA |

---

## Documentation

Detailed docs live in the [`docs/`](docs/) directory:

| Area | Path | Contents |
|---|---|---|
| Architecture decisions | `docs/architecture/` | 20 decision docs — admin moderation, matchmaking v2 design, partner portals, auth hardening, builder search, registration privacy, … |
| Matchmaking design | `docs/architecture/matchmaking-v2/` | Blueprint SQL, design doc, squad-matcher spec, validation |
| QA reports | `docs/qa/` | Before/after screenshots and browser test results for 8 features |
| Operational runbooks | `docs/hustle-launch-rehearsal/` | CSV contracts, delivery tracking, operator checklists, rehearsal results |
| Planning | `docs/plans/` | Team activation, evaluator reliability, security remediation |
| SQL scripts | `docs/sql/` | Production pre/postflight queries |

For day-to-day development, see the [Developer Guide](DEVELOPER_GUIDE.md).

---

## Contributing

Contribution guidelines are still being written. If you're interested in
contributing, reach out first rather than opening a PR directly.

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

Built by Yash Shah and the HackerMate team.
