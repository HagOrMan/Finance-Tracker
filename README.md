# Finance Tracker

A personal finance tracker — Next.js + Supabase. Tracks receipts (money paid out) and disbursements (money received back, often refunds for group purchases).

- `CLAUDE.md` — how this repo is organized and worked on
- `ARCHITECTURE.md` — why it's shaped this way, and the invariants
- `PROGRESS.md` — current state and open work

The original Streamlit app it was migrated from is preserved in `legacy_streamlit/`.

## Setup

```bash
pnpm install
cp .env.example .env.local   # every var is documented there
pnpm dev
```

Schema lives in `supabase/migrations/`. `finance_tracker` must be added to the
Supabase project's exposed-schemas setting, and `OWNER_USER_IDS` bootstrapped by
signing in once and copying the id printed on `/login`.

## Stack

Next.js (App Router) · React · TypeScript · Tailwind v4 · shadcn/ui · Supabase (Postgres + Auth) · TanStack Query · Zustand · Recharts · Resend
