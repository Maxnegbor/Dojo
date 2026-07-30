# Dojo

A goal-oriented habit and productivity platform — track health metrics, manage your schedule, and hit performance targets.

## Features

- **Today** — Log sleep, weight, steps, screen time; focus timer with auto-logging; workout tracking (HIIT, Zone 2, Strength); daily notes; streak counter
- **Schedule** — Interactive hourly timeline with drag-and-drop time blocks; tasks & reminders with overdue tracking and rescheduling
- **Goals** — Daily/weekly targets for native and custom metrics; smart weight tracking (bulk/cut from start → goal weight)
- **Overview** — Trend charts (Recharts), workout category averages, goal progress bars

## Stack

- Vite + React 19 + TypeScript
- Tailwind CSS 4
- Supabase (Postgres + auth + real-time)
- Recharts

## Getting Started

### Prerequisites

Install [Node.js](https://nodejs.org/) (v20+) and optionally [Xcode Command Line Tools](https://developer.apple.com/xcode/resources/) for git.

### Install & Run

```bash
cd ~/Projects/personal-os
npm install
cp .env.example .env   # add your Supabase credentials
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase/schema.sql` in the SQL editor (new projects)
3. **Existing projects:** also run migrations in order:
   - `supabase/migrations/001_user_storage_and_schema_updates.sql`
   - `supabase/migrations/002_sleep_metrics.sql`
   - `supabase/migrations/003_delete_own_account.sql` (required for account deletion)
4. Enable email auth (Authentication → Providers → Email)
5. Copy your project URL and anon key into `.env`:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

When Supabase is configured, **all app data** is stored in Postgres:

| Table | Data |
|-------|------|
| `daily_logs`, `workouts`, `goals`, `schedule_blocks`, `reminders` | Core tracking |
| `user_storage` | Settings, habit/workout types, weekly logs, drafts, goal snapshots, shutdown state |

On first login, existing browser `personal-os-*` keys are migrated into `user_storage` automatically.

Without Supabase credentials, the app runs in **local mode** using browser localStorage.

## Host Dojo (GitHub + Supabase + Vercel)

You do **not** need a local Node install for production. Host everything in the browser.

### 1. GitHub

Repo is already at [github.com/Maxnegbor/Dojo](https://github.com/Maxnegbor/Dojo).

1. Open the repo on GitHub
2. Commit/push your latest code (from this machine or GitHub web / Codespaces) so `main` is up to date

### 2. Supabase (database + auth)

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project** (or open an existing one)
2. Wait until the project is ready
3. Open **SQL Editor** → New query → paste the full contents of [`supabase/schema.sql`](supabase/schema.sql) → **Run**
4. If the project already existed without newer columns, also run each file in order under `supabase/migrations/`
5. **Authentication → Providers → Email** → enable Email
6. **Authentication → URL Configuration**
   - **Site URL:** your Vercel URL (set after step 3), e.g. `https://dojo-xxxxx.vercel.app`
   - **Redirect URLs:** add the same URL, plus `http://localhost:5173` if you develop locally later
7. **Project Settings → API** — copy:
   - Project URL → `VITE_SUPABASE_URL`
   - `anon` `public` key → `VITE_SUPABASE_ANON_KEY`

### 3. Vercel (host the app)

1. Go to [vercel.com](https://vercel.com) → **Add New… → Project**
2. **Import** the `Maxnegbor/Dojo` GitHub repo (authorize GitHub if asked)
3. Framework preset: **Vite** (auto-detected). Build: `npm run build`, output: `dist`
4. **Environment Variables** (Production + Preview):

| Name | Value |
|------|--------|
| `VITE_SUPABASE_URL` | `https://YOUR_REF.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | your anon key |

5. Click **Deploy**
6. Copy the deployment URL (e.g. `https://dojo-xxx.vercel.app`)
7. Paste that URL into Supabase **Site URL** / **Redirect URLs** (step 2.6) and save

Every push to `main` redeploys automatically.

### 4. Smoke test

1. Open the Vercel URL
2. Sign up with email/password
3. Complete onboarding and log a metric
4. Confirm data appears after refresh (Postgres, not only localStorage)

### Optional: custom domain

Vercel → Project → **Settings → Domains** → add your domain, then set that domain as Supabase Site URL.

## Project Structure

```
src/
├── components/   # UI, Today, Schedule, Goals, Dashboard
├── hooks/        # Data fetching hooks
├── lib/          # Supabase client, local store, metrics
├── pages/        # Route pages
└── types/        # Shared TypeScript types
supabase/
└── schema.sql    # Database schema + RLS policies
```

## Scripts

| Command        | Description          |
|----------------|----------------------|
| `npm run dev`  | Start dev server     |
| `npm run build`| Production build     |
| `npm run preview` | Preview production build |
