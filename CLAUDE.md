# CLAUDE.md

Read this first, every session.

## What this is

A single-user personal finance tracker: **Next.js 16 (App Router) + React 19 +
TypeScript**, deployed on Vercel, data in **Supabase** (Postgres, in a dedicated
`finance_tracker` schema). Gated by Supabase Auth (**Google OAuth only**) plus an
`OWNER_USER_IDS` allowlist. The Supabase project is **shared with the user's
other apps**, so a valid session proves identity, not access.

Migrated from a Streamlit/Python original, preserved untouched in
`legacy_streamlit/` as a reference. Don't edit it as part of Next.js work.

## Docs

| File | What's in it |
| --- | --- |
| `CLAUDE.md` | This file — stack, layout, hard rules |
| `ARCHITECTURE.md` | Why the app is shaped this way, and the invariants. **Read before touching auth, the data layer, subscriptions, reports, or email.** |
| `PROGRESS.md` | Current state and open work. Update as you go |
| `.env.example` | Every env var. Treat `.env.local` as user-owned; never commit it |
| `supabase/migrations/*.sql` | The schema. Source of truth, not any prose |

## Stack

**Tailwind v4** (CSS-first, no config file) + hand-authored **shadcn/ui**
primitives in `src/components/ui/`. **TanStack Query** for client fetching,
**Zustand** (localStorage-persisted) for cross-page filters,
**react-hook-form + zod** for forms with the same schemas reused server-side,
**Recharts** for charts, **Resend** for email. Package manager is **pnpm**.

The `/monthly` category×month heatmap is a hand-built CSS grid — Recharts has no
heatmap mark.

## Layout

Everything lives under `src/` (Next's own convention when `src/` is used);
config files stay at the repo root.

```
src/
├── app/          # 11 pages + /api/{receipts,disbursements,subscriptions,reports,cron}
├── components/   # ui/ = shadcn primitives, charts/ = Recharts wrappers,
│                 # report/ = spending-report views, auth/ = sign-in/out
├── hooks/        # use-finance-data (react-query), use-category-colors, use-media-query
├── lib/
│   ├── data/     # types, DataSource interface, supabase/sqlite sources, zod schemas
│   ├── supabase/ # server.ts (cookies — AUTH ONLY), service.ts (secret key — DATA ONLY)
│   ├── email/    # layout.ts (shell), send.ts (Resend), one file per template
│   ├── auth.ts / auth-server.ts       # allowlist; requireUser / requireOwnerForApi
│   ├── reports.ts / reports-runner.ts # pure model / the I/O half
│   ├── subscriptions.ts / -runner.ts  # same split
│   └── colors, dates, filters, savings, format, name-groups, stores, entities
├── store/filters-store.ts
└── proxy.ts      # Next 16's rename of middleware.ts — must export `proxy`
```

Pure modules and `*-runner.ts` modules are split on purpose: the runner is
`server-only` and does the I/O, the pure one is importable from the client and
checkable by hand.

## Hard rules

- **Pattern A: the finance tables are server-only and secret-key-only.** Nothing
  in the browser talks to Supabase. Reads and writes go route handler →
  `getDataSource()` → `src/lib/supabase/service.ts`. Don't add RLS policies —
  under `service_role` they're dead code. Any new table needs an explicit
  `service_role` grant (a custom schema inherits none) plus
  `enable row level security`.
- **`SUPABASE_SECRET_KEY` is reachable only through `service.ts`.** Never prefix
  it `NEXT_PUBLIC_`. `src/lib/supabase/server.ts` is for **auth only**, never
  data.
- **`OWNER_USER_IDS` is the only authorization gate, and there is no database
  backstop.** Every route handler starts with `await requireOwnerForApi()` and
  every page/Server Action with `await requireUser()`. No exceptions for "it's
  just a read" — a handler that omits the call is public. Always `getUser()`,
  never `getSession()`, server-side.
- **Exactly one exception and no third gate:** `GET /api/cron/subscriptions`,
  which uses a timing-safe `CRON_SECRET` bearer. Any *other* handler missing
  `requireOwnerForApi()` is a bug, not a second exception.
- **The data layer is the only place that touches Supabase or SQLite.** No
  inline `supabase.from(...)` in components; no `better-sqlite3` outside
  `sqlite-source.ts`.
- **Dates are plain `"YYYY-MM-DD"` strings** — never `new Date("YYYY-MM-DD")`
  for display or comparison.
- **`src/lib/colors.ts` is the only source of category colour.** Same category,
  same colour, everywhere, in both themes.
- **Never run build, dev, or test commands** (global constraint). `pnpm install`
  and `pnpm add` are fine; `pnpm dev`/`build`/`lint`/`tsc` are not — ask the user
  to run them and report back.

## How to work here

1. **Keep changes scoped.** Note follow-ups in `PROGRESS.md` rather than fixing
   them inline.
2. **Ask before deviating from the architecture** in `ARCHITECTURE.md` (data
   layer abstraction, the auth model, schema shape). Naming and file
   organisation within `src/` are yours to decide.
3. **When you finish:** update `PROGRESS.md`, add any new env var to
   `.env.example`, and summarise what changed.
