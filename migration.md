# migration.md — Streamlit → Next.js Migration Plan

Status: **planning complete, blocking questions resolved, implementation starting**.
This document is the single source of truth for the rewrite. Update it as decisions change.

---

## 0. Resolved blocking decisions

These were confirmed by the user on 2026-07-12 before any code was written:

| Question | Decision |
|---|---|
| Auth / access control | **Supabase Auth**, sign-in via **Google + GitHub** OAuth providers. Single authorized user; user restricts access on the Supabase side (RLS / allowed user). App still needs a login page + route protection middleware. |
| SQLite's role going forward | **Local dev/offline toggle only.** The Next.js data layer supports both a Supabase adapter and a SQLite adapter behind one interface, switched by an env var. No ongoing bidirectional sync is being built. |
| Gooey desktop uploader script | **Out of scope.** It lives in a different repo and is not touched, ported, or synced by this migration. (The *functionality* of adding receipts/disbursements is still rebuilt, as the new "quick add" modal — that's a website feature request, independent of the old script's fate.) |
| Existing Streamlit app files | **Move to `legacy_streamlit/`**, kept indefinitely as a fallback/reference. Not deleted. |

---

## 1. What this migration is

Rebuild the Streamlit finance tracker (`app.py`, `pages/`, `finance_tracker/`) as a Next.js + React app deployed on Vercel, matching the visual language of the user's personal site (`src/app/globals.css`, already in place — turquoise/`lush` primary, blue/`breeze` secondary, purple/`nebula` for extreme/destructive-adjacent cases). Data moves from a local SQLite file to Supabase (Postgres), with SQLite kept only as an optional local-dev data source. A new feature — a quick-add modal for receipts/disbursements — is added, which the old app never had (it was read-only by design).

## 2. Non-negotiable constraints carried forward

- Single authorized user only. Nobody else should ever see or write data, enforced by Supabase RLS, not just app-level checks.
- Category→color mapping must be identical across every page (same rule as the old `finance_tracker/colors.py`).
- Default date range on load = last 30 days.
- Net-paid (`actual_price`) vs gross (`price`) toggle, default **on**, same semantics as before: `actual_price = price - total_refunded`, where `total_refunded` only sums disbursements with non-null `refunded_from_receipt`.
- Savings formula (confirmed 2026-05-09, `PROGRESS.md`): `price` is post-discount. Savings = `discount + price * discount_percentage / (100 - discount_percentage)`, guarded at `discount_percentage = 100`.

## 3. Tech stack (latest versions as of 2026-07-12, via `pnpm`)

| Package | Version | Purpose |
|---|---|---|
| next | 16.2.10 | App Router, Server Components, middleware |
| react / react-dom | 19.2.7 | UI |
| typescript | 7.0.2 | Type safety |
| tailwindcss | 4.3.2 | Styling (CSS-first config, matches existing `globals.css`) |
| @supabase/supabase-js | 2.110.2 | Supabase client |
| @supabase/ssr | 0.12.0 | Cookie-based auth session handling in App Router (server + client) |
| @tanstack/react-query | 5.101.2 | Client-side caching of loaded datasets + manual refresh, mirrors old `@st.cache_data` + refresh button |
| zustand | 5.0.14 | Cross-page filter state (persisted to `localStorage`), mirrors old `st.session_state` |
| react-hook-form | 7.81.0 | Quick-add modal forms |
| zod | 4.4.3 | Form + API input validation |
| recharts | 3.9.2 | Charts (stacked bar, pie, line) — supports hover tooltips natively |
| date-fns | 4.4.0 | Date bucketing (daily/weekly resampling), avoids timezone footguns |
| better-sqlite3 | 12.11.1 | **Dev-only** SQLite adapter, Node runtime only, never bundled for prod |
| sonner | 2.0.7 | Toast notifications (quick-add success/error) |
| shadcn/ui (CLI, not a dependency) | latest | Dialog/Sheet/Drawer, Tabs, Select, Combobox, DataTable — matches the shadcn-shaped CSS variables already in `globals.css` |

All installs via `pnpm add ...` — **not npm**, per user preference.

Package manager note: use `pnpm` for every install/script in this repo from now on (`pnpm install`, `pnpm dev`, `pnpm add <pkg>`, etc).

### Decisions made without asking (flagged for your review, not blocking)

- **shadcn/ui as the component layer.** `globals.css` already defines shadcn's exact CSS variable set (`--card`, `--popover`, `--accent`, `--destructive`, `--ring`, `--radius`) and references Radix (`--radix-collapsible-content-height`). This strongly implies the personal site uses shadcn/ui, so the new app follows suit for visual consistency. If your other sites actually use something else, say so and I'll swap it.
- **Recharts over Plotly.js.** The old app picked Plotly specifically for native hover tooltips. Recharts also supports hover tooltips natively, is far lighter (no WebGL/Plotly.js bundle bloat), and has first-class Tailwind/shadcn integration (`shadcn` ships a `chart` block built on Recharts). The one thing Plotly did that Recharts doesn't do out of the box is the **category×month heatmap** on the Monthly page — that will be hand-built as a CSS grid of colored cells (category rows × month columns, background-color intensity from a scale function), not a charting-library heatmap. Simpler, no extra dependency.
- **Filter state via Zustand + localStorage, not URL params.** The old app persisted filters in `st.session_state` across Streamlit's multi-page nav within a session. `nuqs`-style URL search params were considered (more shareable/bookmarkable) but would require every internal `<Link>` to carry query strings forward, adding friction for no strong benefit in a single-user app. A small Zustand store persisted to `localStorage` reproduces the old behavior most directly.
- **Dates as plain strings, not `Date` objects, wherever possible.** `date` / `date_received` are `YYYY-MM-DD` with no time component. `new Date("2026-07-12")` parses as UTC midnight and can display as the *previous* day in negative-UTC-offset timezones — a classic off-by-one bug. Wherever the old pandas code did `.dt.date` comparisons, the new code compares plain `"YYYY-MM-DD"` strings or uses `date-fns`'s timezone-safe parsing (`parseISO` + operating in a fixed "no timezone" mode), never relying on implicit local-timezone `Date` parsing.
- **TypeScript pinned to latest 5.x (5.9.3), not the new major 7.0.2.** `npm view typescript version` currently resolves to a TS7 release (the native/Corsa compiler rewrite). It's extremely new and `typescript-eslint`/tooling compatibility with it is unproven; pinning to the latest stable 5.x line is the "latest version that's actually safe" reading of "latest for security," not a stale pin. Every other package in the stack is genuinely latest-as-of-2026-07-12. Happy to bump to TS7 later if you want to be on the bleeding edge once the ecosystem catches up.
- **ESLint pinned to latest 9.x (9.39.5), not 10.7.0.** `eslint-config-next@16.2.10`'s own transitive plugins (`eslint-plugin-import`, `eslint-plugin-jsx-a11y`, `eslint-plugin-react`) declare `eslint` peer ranges that top out at `^9`; installing eslint 10 produced unmet-peer warnings from `pnpm install`. Same reasoning as the TypeScript pin above — genuinely latest within what the rest of the toolchain actually supports.
- **A dedicated Postgres schema (`finance_tracker`), not `public`.** In case the Supabase project ends up shared with other personal apps, keeping tables in their own schema avoids name collisions and makes RLS policies easier to audit in isolation. (See §6.)

---

## 4. Project structure

```
Finance-Tracker/
├── migration.md                # this file
├── CLAUDE.md                   # updated at the end to describe the new stack
├── PROGRESS.md                 # kept, repurposed for the Next.js app going forward
├── package.json                # root — standard Next.js file
├── next.config.ts              # root
├── tsconfig.json                # root
├── postcss.config.mjs          # root (Tailwind v4 plugin)
├── .env.local                   # gitignored — Supabase URL/keys, DATA_SOURCE toggle
├── .env.example                 # committed — documents required env vars, no real values
├── components.json              # shadcn/ui config, root (its own convention)
├── src/
│   ├── middleware.ts             # Next.js convention: lives inside src/ when src/ is used; auth-gate
│   ├── app/
│   │   ├── globals.css          # ALREADY PRESENT — untouched
│   │   ├── layout.tsx           # root layout: nav, filter bar, quick-add button, providers
│   │   ├── page.tsx              # Overview (was app.py)
│   │   ├── login/page.tsx        # Supabase Auth sign-in (Google + GitHub buttons)
│   │   ├── auth/callback/route.ts # OAuth callback handler
│   │   ├── daily/page.tsx        # was pages/1_Daily.py
│   │   ├── monthly/page.tsx      # was pages/2_Monthly.py
│   │   ├── categories/page.tsx   # was pages/3_Categories.py
│   │   ├── savings/page.tsx      # was pages/4_Savings.py
│   │   ├── disbursements/page.tsx# was pages/5_Disbursements.py
│   │   └── api/
│   │       ├── receipts/route.ts        # GET (server-side load), POST (quick add)
│   │       └── disbursements/route.ts   # GET, POST
│   ├── components/
│   │   ├── ui/                   # shadcn-generated primitives
│   │   ├── filter-bar.tsx
│   │   ├── quick-add-modal.tsx
│   │   ├── nav.tsx
│   │   └── charts/                # daily-stacked-bar.tsx, category-pie.tsx, monthly-heatmap.tsx, ...
│   ├── lib/
│   │   ├── data/
│   │   │   ├── types.ts           # Receipt, Disbursement, MergedReceipt types
│   │   │   ├── source.ts          # DataSource interface + factory (reads DATA_SOURCE env)
│   │   │   ├── supabase-source.ts # Supabase implementation
│   │   │   └── sqlite-source.ts   # better-sqlite3 implementation, dev-only, dynamically imported
│   │   ├── supabase/
│   │   │   ├── client.ts          # browser client
│   │   │   ├── server.ts          # server client (cookies-based, App Router)
│   │   │   └── middleware.ts      # session refresh helper for middleware.ts
│   │   ├── colors.ts               # category→color map (ported from finance_tracker/colors.py)
│   │   ├── filters.ts              # Filters type, apply logic, price col/label helpers
│   │   └── savings.ts              # savings formula (ported)
│   ├── store/
│   │   └── filters-store.ts        # zustand store, localStorage-persisted
│   └── hooks/
│       └── use-finance-data.ts     # react-query hooks wrapping the data layer
├── scripts/
│   └── migrate-sqlite-to-supabase.ts   # one-time migration script (see §7)
└── legacy_streamlit/                # moved wholesale from repo root, untouched
    ├── app.py
    ├── pages/
    ├── finance_tracker/
    ├── config.py
    ├── example_config.py
    ├── requirements.txt
    ├── run.sh
    └── SPEC.md
```

This satisfies "everything that usually goes in `src/` goes in `src/`" while `middleware.ts`, config files, and `package.json` stay at root, matching standard Next.js `--src-dir` conventions.

---

## 5. Auth

- Supabase Auth, OAuth providers **Google** and **GitHub**, configured on the Supabase project (user's responsibility — same setup pattern as their other apps).
- `middleware.ts` at root refreshes the Supabase session on every request and redirects unauthenticated requests to `/login`, for every route except `/login` and the OAuth callback.
- Single-user restriction is enforced **in Supabase**, not just the app (per user's explicit choice) — e.g. an allow-list check in RLS policies keyed to the one authorized `auth.uid()` / email. The app does not hardcode who the user is; it trusts RLS to reject anyone else's reads/writes.
- No email/password form, no signup flow — just two OAuth buttons on `/login`.

## 6. Supabase schema

Dedicated schema `finance_tracker` (see §3 rationale). Mirrors the existing SQLite schema, with Postgres-appropriate types and RLS.

```sql
create schema if not exists finance_tracker;

create table finance_tracker.receipts (
    id bigint generated always as identity primary key,
    store text not null,
    category text not null,
    price numeric not null,
    discount numeric not null default 0,
    discount_percentage numeric not null default 0,
    note text,
    date date not null,
    user_id uuid not null default auth.uid() references auth.users(id),
    created_at timestamptz not null default now()
);

create table finance_tracker.disbursements (
    id bigint generated always as identity primary key,
    entity text not null,
    amount numeric not null,
    date_received date not null,
    reason text,
    refunded_from_receipt bigint references finance_tracker.receipts(id),
    user_id uuid not null default auth.uid() references auth.users(id),
    created_at timestamptz not null default now()
);

alter table finance_tracker.receipts enable row level security;
alter table finance_tracker.disbursements enable row level security;

create policy "owner full access" on finance_tracker.receipts
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "owner full access" on finance_tracker.disbursements
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Notes:
- `user_id` + RLS is the standard Supabase pattern; it composes with whatever single-user allow-list the user sets up separately (e.g. restricting which `auth.users` rows can even exist, via a trigger or provider config) without the app needing to know.
- Since `id` on `receipts` is referenced by `disbursements.refunded_from_receipt`, the migration script (§7) must preserve original SQLite `id` values exactly and reset the identity sequence afterward — otherwise historical refund links break.
- **Open question for the user, non-blocking:** should `finance_tracker.receipts.category` stay a free-text column (current behavior — any string allowed) or become a `check` constraint / lookup table against the 12-item `CATEGORY_OPTIONS` list from the Gooey script? Defaulting to **free text**, matching current DB behavior, since old data may not perfectly match that list. The quick-add form's dropdown will offer `CATEGORY_OPTIONS` plus "Other" (free text), same as the DB currently tolerates.

## 7. One-time SQLite → Supabase migration script

`scripts/migrate-sqlite-to-supabase.ts`, run manually and once (not part of the app, not scheduled):

1. Read `config.DB_PATH`'s SQLite file (`better-sqlite3`, read-only).
2. Read all rows from `receipts`, then `disbursements`.
3. Insert into Supabase via the **service role key** (server-only, never shipped to the client, bypasses RLS for this admin operation) with explicit `id` values and a fixed `user_id` (the one authorized user's UID, provided by the user at run time).
4. After inserts, run `select setval('finance_tracker.receipts_id_seq', (select max(id) from finance_tracker.receipts));` (and same for disbursements) so future `identity` inserts don't collide with migrated IDs.
5. Print a row-count diff (SQLite count vs Supabase count post-insert) as a sanity check.
6. **This script requires you to provide, at run time:** the Supabase project URL, the service role key, and your `auth.uid()` (get it by signing in once via the app's `/login` and reading it from the Supabase dashboard's `auth.users` table, or `select id from auth.users`). None of these get committed to the repo.

This script is **not run automatically** as part of this migration — I'll write it, then hand control back to you to actually execute it once your Supabase project + OAuth providers + one real sign-in exist, since I don't have credentials to your Supabase account.

## 8. Local SQLite dev toggle

- `DATA_SOURCE=sqlite | supabase` in `.env.local`, default `supabase`.
- `src/lib/data/source.ts` exports `getDataSource()`, returning either `SupabaseDataSource` or `SqliteDataSource` based on the env var — both implement the same `DataSource` interface (`loadReceipts`, `loadDisbursements`, `loadMergedReceipts`, `insertReceipt`, `insertDisbursement`).
- `SqliteDataSource` dynamically imports `better-sqlite3` (`await import(...)`) so it's never pulled into a production bundle path when `DATA_SOURCE=supabase` — avoids shipping a native binary dependency to Vercel's serverless functions when it's unused.
- SQLite mode is for local development/testing only; it is never selected in production (Vercel's filesystem is ephemeral and wouldn't have the file anyway).

## 9. Page-by-page parity mapping

| Old (Streamlit) | New (Next.js route) | Notes |
|---|---|---|
| `app.py` (Overview) | `/` | KPI cards, mini spend-per-day bar, recent receipts table with in-table filters. Quick-add button lives in the shared layout, not this page specifically. |
| `pages/1_Daily.py` | `/daily` | Stacked bar (date × category), hover tooltip (store/category/amount/note), receipts table below. |
| `pages/2_Monthly.py` | `/monthly` | Month multiselect, KPIs, stacked bar by month+category, per-month tabs of receipts, category trend line, category×month heatmap (custom grid, see §3). |
| `pages/3_Categories.py` | `/categories` | Pie chart (Sum/Mean toggle), summary table with %-of-total. |
| `pages/4_Savings.py` | `/savings` | Savings KPIs, savings-over-time bar (daily ≤60d range else weekly), savings-by-category bar, spend extrapolation table + cumulative line with dashed 30-day projection. |
| `pages/5_Disbursements.py` | `/disbursements` | Its own filter bar (date range + entity, no category/store/net-paid — matches old page, which deliberately omitted those). KPIs, time chart, by-entity chart, enriched table (linked receipt store/category for refunds). |
| *(new)* | shared layout | Nav bar, global filter bar (date range, category, store, has-discount, net-paid toggle + refresh), quick-add floating button + modal, theme toggle (light/dark, using the `.dark` variables already in `globals.css`). |

Filter bar behavior: same filter set and defaults as `SPEC.md` §3, persisted via the Zustand store described in §3, not per-page local state — so navigating from Daily to Categories keeps your date range/category/store selections, exactly like the old `st.session_state` behavior.

## 10. Quick-add modal

New feature, not in the old read-only app. Triggered by a floating "+" button, always visible in the shared layout (visible on every page, mobile and desktop).

- **Component:** shadcn `Dialog` on desktop, shadcn `Drawer`/`Sheet` on mobile (same trigger, responsive by viewport — shadcn's own pattern for this exact case).
- **Tabs inside:** "Receipt" / "Disbursement", mirroring the old Gooey script's two tabs.
- **Receipt fields:** store (text), category (select — `CATEGORY_OPTIONS` + "Other" free text), price (number), discount (number, default 0), discount_percentage (number, default 0), note (optional text), date (date picker, default today).
- **Disbursement fields:** entity (text), amount (number), date_received (date picker, default today), reason (optional text), refunded_from_receipt (optional — searchable combobox listing recent receipts by "date · store · $price", resolves to the receipt id).
- Validation via `zod` schemas shared between the client form and the `POST /api/receipts` / `POST /api/disbursements` route handlers (never trust client-side validation alone for a write path).
- On submit: POST to the API route (authenticated via the Supabase session cookie, RLS enforces `user_id`), then `react-query` invalidates the cached receipts/disbursements query so every open page reflects the new entry without a manual refresh.
- `CATEGORY_OPTIONS` constant ported verbatim from the Gooey script into `src/lib/data/types.ts` (or a `constants.ts`) — the 12 categories listed there.

## 11. Category color mapping

Direct port of `finance_tracker/colors.py`'s logic: sort distinct categories alphabetically, assign from a fixed qualitative palette, cycle if there are more categories than palette slots. Implemented in `src/lib/colors.ts` + `src/hooks/use-category-colors.ts`.

Palette derivation (via the `dataviz` skill, not eyeballed): started from the skill's validated 8-hue reference categorical palette (`blue, aqua, yellow, green, violet, red, magenta, orange`, worst adjacent CVD ΔE 24.2 light / 10.3 dark), then substituted the brand's `breeze` (blue), `lush` (turquoise, in the "aqua" slot), and `nebula` (violet) hues into their same-family slots **without changing slot order** — reordering to lead with turquoise was tried first and *failed* CVD validation in dark mode (blue↔violet ΔE dropped to 2.5 under protanopia once adjacent), so the proven reference ordering was kept and only the hue values within each slot were swapped. Both light and dark 8-hue sets were re-validated with `scripts/validate_palette.js` and pass (light: full pass, 3 slots in the documented sub-3:1 contrast "relief" band; dark: CVD in the 8–12 "floor" band). The relief/floor conditions are satisfied by design — every chart using this palette always shows the category name in a legend and/or hover tooltip, so identity is never color-alone.

The 12 `CATEGORY_OPTIONS` need more than 8 slots: categories 9–12 extend the palette as a white-mixed tint (45%) of slots 1–4, a pragmatic (not re-validated) extension tier, documented as lower-safety and likewise relying on the always-present text labels. Categories beyond 12 (arbitrary free-text) cycle through the full 12-slot array with `% palette.length`, same as the old app's Plotly-cycling behavior.

## 12. What's explicitly NOT changing in scope

- Still no delete/edit UI for existing rows — only new-row insert (quick add). Matches `SPEC.md` §8's future-proofing intent; editing/deleting is a bigger feature the user hasn't asked for.
- No multi-user support beyond what Supabase RLS naturally allows — this is built and documented as a single-user app.
- No automated SQLite↔Supabase sync job/cron — §0 confirmed this isn't wanted.

## 13. Environment variables (`.env.example`)

```
# Supabase (required in all environments)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-only, used by scripts/migrate-sqlite-to-supabase.ts, never exposed to client

# Data source toggle (local dev only; always "supabase" in production/Vercel)
DATA_SOURCE=supabase              # or "sqlite"
SQLITE_DB_PATH=                   # absolute path, only read when DATA_SOURCE=sqlite
```

`.env.local` (real values) is gitignored, same as the old `config.py` was. `SUPABASE_SERVICE_ROLE_KEY` must never be prefixed `NEXT_PUBLIC_` and never referenced from client components.

## 14. Execution plan / milestones

1. [x] Explore existing codebase, resolve blocking questions, write this document.
2. [ ] Move Streamlit app into `legacy_streamlit/`.
3. [ ] Scaffold Next.js app (`pnpm create next-app` equivalent by hand, since `globals.css` already exists and must not be clobbered) with TypeScript, Tailwind v4, `src/` layout, ESLint.
4. [ ] Install dependencies listed in §3 via `pnpm add`.
5. [ ] Set up shadcn/ui, generate needed primitives (Dialog, Drawer, Tabs, Select, Combobox, Table, Button, Card, Calendar/DatePicker, Toast/Sonner).
6. [ ] Build `src/lib/supabase/*` client helpers + `middleware.ts` auth gate + `/login` page.
7. [ ] Build the `DataSource` interface + Supabase and SQLite implementations.
8. [ ] Port `colors.ts`, `filters.ts`, `savings.ts` from the Python originals.
9. [ ] Build shared layout: nav, filter bar, quick-add modal, theme toggle.
10. [ ] Build all 6 pages, porting chart-by-chart from `finance_tracker/charts.py`.
11. [ ] Write `scripts/migrate-sqlite-to-supabase.ts`.
12. [ ] Write `.env.example`, update `README.md`, rewrite `CLAUDE.md` for the new stack, retire/replace `PROGRESS.md` and `SPEC.md` content (or fold relevant bits into the new `CLAUDE.md`).
13. [ ] Hand back to user for: Supabase project creation/confirmation, OAuth provider setup, providing real env values, running the migration script, first deploy to Vercel.

Items after step 12 require the user's Supabase credentials and account access, which I don't have — those steps are theirs to run, with me providing exact commands/instructions when we get there.

## 14a. Daily stacked bar: aggregated by category, not by individual receipt

`SPEC.md` §6.2 describes the Daily chart as one **segment per receipt**, colored by category (so two same-day, same-category receipts render as two stacked segments). Recharts' stacked `<Bar>` model stacks by `dataKey` (one series per category) across a shared x-axis, not by arbitrary per-row segments — reproducing true per-receipt segments would mean giving every individual receipt its own sparse `dataKey` column, which blows up the legend (one entry per receipt instead of per category) and doesn't compose with Recharts' legend/tooltip model. The Next.js Daily chart instead **sums same-day receipts within a category into one segment**; the receipts table directly below the chart (same as before) still lists every individual receipt with store/note/amount. Net effect: the chart shows category totals per day instead of per-receipt slices; nothing is lost, it just moved from "in the bar" to "in the table below it."

## 15. Things to flag for your review once the build is further along

(Running list — appended to as I build, not exhaustive yet.)

- Pandas' `.resample("W")` buckets weeks ending Sunday by default; the `date-fns`-based reimplementation will need an explicit decision on week boundary (ISO week = Mon–Sun vs pandas' Sun-ending) — will default to ISO weeks unless told otherwise, since it's more standard, but the bucketing (and thus historical weekly totals shown) will shift slightly from what the old Streamlit app showed.
- Whether you want the quick-add "refunded_from_receipt" combobox to search *all* receipts or only recent/unreconciled ones (all receipts could get long over time).
- Whether the dedicated `finance_tracker` Postgres schema needs to be added to Supabase's "exposed schemas" API setting (Supabase only exposes `public` by default over PostgREST) — will confirm the exact setting name when we get to schema setup.
