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
