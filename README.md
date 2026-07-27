# Finance Tracker

A personal finance tracker — Next.js + Supabase. Tracks receipts (money paid out) and disbursements (money received back, often refunds for group purchases).

See `CLAUDE.md` for how this repo is organized and worked on, and `migration.md` for the full record of the Streamlit → Next.js migration. The original Streamlit app is preserved in `legacy_streamlit/`.

## Setup

```bash
pnpm install
cp .env.example .env.local   # fill in your Supabase project's URL/anon key
pnpm dev
```

See `PROGRESS.md`'s "Backlog" section for the full one-time Supabase setup checklist (schema, auth providers, data migration from the old SQLite DB).

## Stack

Next.js (App Router) · React · TypeScript · Tailwind v4 · shadcn/ui · Supabase (Postgres + Auth) · TanStack Query · Zustand · Recharts
