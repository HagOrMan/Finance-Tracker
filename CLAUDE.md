# CLAUDE.md

This file is the entry point for Claude Code. Read this first, every session, before doing anything else.

## What this project is

A personal finance tracker — a **Next.js (App Router) + React** app deployed on Vercel, matching the visual language of the user's personal site (turquoise `lush` primary, blue `breeze` secondary, purple `nebula` for extreme cases — see `src/app/globals.css`, already in place, don't redesign it). Data lives in **Supabase** (Postgres), single-user, gated by Supabase Auth (**Google OAuth only**) plus an `OWNER_USER_IDS` allowlist. The Supabase project is **shared with the user's other apps**, so `auth.users` is a shared pool: a valid session proves identity, not access — authorization is per-app and lives in `src/lib/auth.ts` / `src/lib/auth-server.ts`. All data access is server-side via the secret key; see the Pattern A hard rule below. A local **SQLite** data source is also supported for offline dev only (see "Data layer" below) — it is never used in production.

This was migrated from an earlier Streamlit/Python version of the same app. That version is preserved untouched in `legacy_streamlit/` (its own `CLAUDE.md`-equivalent context is `legacy_streamlit/SPEC.md`) as a fallback/reference — don't edit it as part of Next.js work. **`migration.md`** is the full record of that migration: every architectural decision, why, and what was flagged for follow-up. Read it once for context; it does not need re-reading every session.

## How to work in this repo

1. **Always read `PROGRESS.md` first.** It tracks what has been built, what is in progress, and what is next. Update it as you go.
2. **Read `FEATURES.md` before touching stores, receipt editing, or subscriptions.** It is the approved design for the next three features (Phase 0 write path → Stores page → CRUD tables → subscriptions), including the schema migrations, route contracts, and the invariants that must not be re-litigated — chiefly *receipts are the ledger of facts; subscriptions generate into them and are never read by the math*.
3. **Read `REPORTS.md` before touching the email layer, the subscriptions cron handler, or anything under `/reports`.** It is the approved design for spending reports (the Saturday email plus on-demand week/month/year reviews), including the window math, the habitual-vs-excluded category split, the Gmail-compatibility rules for the HTML, and the invariants that must not be re-litigated — chiefly *a report is a lens: it writes nothing, stores nothing, and never catches up*.
4. **Read `migration.md` when you need historical "why."** It documents the decisions made during the Streamlit→Next.js rewrite (data layer design, palette derivation, auth approach, known simplifications like the Daily chart's per-category-not-per-receipt aggregation). Don't re-litigate those decisions without a reason.
5. **Treat `.env.local` as user-owned**, same spirit as the old `config.py`. Never commit it; `.env.example` documents the required keys with no real values.
6. **Ask before deviating from `migration.md`'s architecture** (data layer abstraction, RLS-based auth, schema shape). Small judgment calls (component naming, file organization within `src/`) are fine to make on your own.
7. **Keep changes scoped.** Don't refactor unrelated code while implementing a feature. Note follow-ups in `PROGRESS.md` rather than doing them inline.

## Tech stack (decided — see `migration.md` §3 for full version list and rationale)

- **Next.js 16 (App Router)** + **React 19** + **TypeScript**.
- **Tailwind v4** (CSS-first config, no `tailwind.config.ts`) + **shadcn/ui** primitives (hand-authored in `src/components/ui/`, matching the CSS variables already in `globals.css`).
- **Supabase** (`@supabase/supabase-js` + `@supabase/ssr`) for auth and data, in a dedicated `finance_tracker` Postgres schema (not `public`).
- **better-sqlite3** as an alternate, dev-only data source — see "Data layer" below.
- **TanStack Query** for client-side data fetching/caching (mirrors the old `@st.cache_data` + manual refresh button).
- **Zustand** (persisted to `localStorage`) for cross-page filter state (mirrors the old `st.session_state`).
- **react-hook-form + zod** for the quick-add form, with the same zod schemas reused server-side in the API routes (never trust client validation alone on a write path).
- **Recharts** for charts (stacked bar, pie, line); the category×month heatmap on `/monthly` is a hand-built CSS grid, not a charting-library heatmap — Recharts has no native heatmap mark.
- Package manager: **pnpm**, not npm.

## Project layout

Everything that would normally sit in a bare `app/` etc. lives under `src/` (App Router pages, `components/`, `lib/`, `hooks/`, `store/`, and `proxy.ts` — Next.js's own convention when a `src/` dir is used). Standard Next.js root files (`package.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `components.json`, `.env*`) stay at the repository root. Full tree in `migration.md` §4.

```
src/
├── app/                  # routes: /, /daily, /monthly, /categories, /savings, /disbursements,
│                         # /login, /auth/callback, /api/receipts, /api/disbursements
├── components/           # shared components; components/ui/ = shadcn primitives;
│                         # components/charts/ = Recharts wrappers;
│                         # components/auth/ = Google sign-in / sign-out buttons
├── hooks/                # use-finance-data (react-query), use-filtered-receipts,
│                         # use-category-colors, use-media-query
├── lib/
│   ├── data/             # types, DataSource interface, supabase-source, sqlite-source, schemas (zod)
│   ├── supabase/         # server.ts (cookie client — AUTH ONLY), middleware.ts,
│   │                     # actions.ts (signInWithGoogle / signOut Server Actions),
│   │                     # service.ts (secret key — the only client that reads data)
│   ├── auth.ts           # edge-safe: sanitizeNextPath, OWNER_USER_IDS allowlist
│   ├── auth-server.ts    # server-only guards: getSessionUser, isOwner, requireUser, requireOwnerForApi
│   ├── env.ts            # requireEnv (server-safe only — dynamic key)
│   ├── colors.ts         # category -> color map (see migration.md §11 for palette derivation)
│   ├── filters.ts        # Filters type, apply logic, price col/label helpers
│   ├── savings.ts        # savings formula
│   └── dates.ts          # ISO-week bucketing, day-math — all on plain "YYYY-MM-DD" strings
├── store/filters-store.ts
└── proxy.ts              # Next 16's rename of `middleware.ts` — must export `proxy`.
                          # Deny-by-default auth gate; redirects unauthorized page
                          # loads to /login, 401s/403s API calls. Node.js runtime.
```

## Hard rules

- **The finance tables are Pattern A: server-only, secret-key-only.** Nothing in the browser ever talks to Supabase. Reads and writes go route handler → `getDataSource()` → `src/lib/supabase/service.ts` (secret key, RLS bypassed). `anon`/`authenticated` hold **no** privileges on `finance_tracker`, and RLS is enabled with **zero policies** as the backstop. Don't add RLS policies — under `service_role` they'd be dead code, and wanting one means the model changed. Schema, grants and RLS live in `supabase/migrations/finance_tracker_schema.sql` — **that file, not `migration.md` §6**, is the source of truth. Any new table gets an explicit `service_role` grant (a custom schema inherits none) plus `enable row level security`.
- **`SUPABASE_SECRET_KEY` may only be reached through `src/lib/supabase/service.ts`.** That file is `server-only`, which turns a client-component import into a build error. Never prefix it `NEXT_PUBLIC_`, never import it anywhere else. `src/lib/supabase/server.ts` (cookie client) is for **auth only** — session reads, OAuth, sign-out — never for data.
- **`OWNER_USER_IDS` is the *only* authorization gate,** and it fails closed when empty. Because queries reach Postgres as `service_role`, the database cannot tell one caller from another — there is no backstop. The proxy (`src/proxy.ts`) is UX only (navigation), so every route handler starts with `await requireOwnerForApi()` and every page/Server Action with `await requireUser()`, from `src/lib/auth-server.ts`. No exceptions for "it's just a read": a handler that omits the call is public. Always `getUser()`, never `getSession()`, on the server.
- **There is exactly one exception, and no third gate: `GET /api/cron/subscriptions`.** A Vercel cron invocation carries no session, so there is nothing for `requireOwnerForApi()` to check; it gates on a `CRON_SECRET` bearer token instead (`requireCronSecret()`, timing-safe, **503 when the secret is unset** — off, not open). It is correspondingly the only entry in `PUBLIC_PATHS` under `/api`, because the deny-by-default proxy would otherwise 401 the cron before the handler ran and the schedule would silently never fire. This is the app's only unauthenticated write endpoint. Any *other* handler without `requireOwnerForApi()` as its first line is a bug, not a second exception.
- **The data layer is the only place that touches SQLite or Supabase directly.** Pages and components call `src/hooks/use-finance-data.ts` (which hits `/api/receipts` and `/api/disbursements`) or, server-side, `getDataSource()` from `src/lib/data/source.ts`. No inline `supabase.from(...)` calls in page components, no inline `better-sqlite3` calls anywhere but `src/lib/data/sqlite-source.ts`.
- **`DATA_SOURCE` env var picks the data source** (`supabase` default, `sqlite` for local dev only). Production is always `supabase`.
- **The category→color mapping is generated once** (`src/lib/colors.ts` + `src/hooks/use-category-colors.ts`) and is the only source every chart may use. Same category = same color, everywhere, in both light and dark mode.
- **Dates are plain `"YYYY-MM-DD"` strings**, compared lexicographically or via `src/lib/dates.ts`'s explicit-UTC helpers — never `new Date("YYYY-MM-DD")` for display/comparison, which is a local-timezone off-by-one-day footgun.
- **Filters live in a horizontal bar at the top of each page** (`src/components/filter-bar.tsx`), backed by the Zustand store so they persist across page navigation and browser sessions. `/monthly` and `/disbursements` have their own variant filter bars per `migration.md` §9 (different filter sets, same underlying store where applicable).
- **Default date range on load is the last 30 days** (`src/lib/config.ts`).
- **The net-paid toggle** (`actual_price` vs gross `price`) defaults **checked**, same semantics as before: `actual_price = price - total_refunded`, where `total_refunded` only sums disbursements with a non-null `refunded_from_receipt`.
- **Quick-add writes go through zod-validated API routes** (`src/app/api/receipts`, `src/app/api/disbursements`), which insert via the authenticated per-request Supabase client — RLS naturally scopes writes to the signed-in user.
- **Never run build/dev/test commands yourself** (global constraint) — `pnpm install`/`pnpm add` are fine, `pnpm dev`/`pnpm build`/`pnpm lint`/`tsc` are not. Ask the user to run those and report back any errors.

## When you finish a task

1. Update `PROGRESS.md`: move the item from "In progress" to "Done", note anything notable.
2. If you added a new dependency, add it via `pnpm add` and make sure it's reflected in `package.json` (already tracked by pnpm — no separate requirements file to maintain, unlike the old Python app).
3. If you added a new env var, update `.env.example` and document it in `PROGRESS.md`.
4. Briefly summarize what changed in your reply to the user.
