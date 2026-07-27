# PROGRESS.md

Rolling log of what's been built, what's in progress, and what's next. **Update this every session.**

---

## Decisions

See `migration.md` for the full record of migration-time decisions (data layer design, auth approach, palette derivation, package version pins, etc). Key ones repeated here for quick reference:

- [x] Data source: Supabase (`finance_tracker` schema), with a `better-sqlite3` local-dev-only alternate behind `DATA_SOURCE` env var.
- [x] Auth: Supabase Auth, Google + GitHub OAuth, single authorized user enforced via RLS (user's responsibility on the Supabase side).
- [x] Charts: Recharts, except the Monthly page's category×month heatmap (hand-built CSS grid).
- [x] Filter persistence: Zustand + localStorage, not URL params.
- [x] Category color palette: dataviz-skill-derived, brand-tuned (turquoise/blue/violet substituted into a validated 8-hue categorical anchor), tinted extension for categories 9-12, cycling beyond that.
- [x] Old Streamlit app preserved in `legacy_streamlit/`, not deleted.

## Done

- **Full Next.js migration (this session)** — entire app rebuilt from the Streamlit original:
  - Root scaffold: `package.json` (pnpm, pinned-latest versions), `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `components.json`.
  - `src/components/ui/*` — hand-authored shadcn/ui primitives (button, card, input, label, dialog, drawer, tabs, select, checkbox, popover, command, table, sonner, badge, separator).
  - Auth: `src/lib/supabase/{client,server,middleware}.ts`, `src/middleware.ts`, `/login`, `/auth/callback`.
  - Data layer: `src/lib/data/{types,merge,source,supabase-source,sqlite-source,schemas}.ts`.
  - Shared logic ports: `src/lib/colors.ts`, `src/lib/filters.ts`, `src/lib/savings.ts`, `src/lib/dates.ts`, `src/lib/format.ts`.
  - State: `src/store/filters-store.ts` (+ `FiltersHydrator` for SSR-safe rehydration), `src/hooks/use-finance-data.ts`, `src/hooks/use-filtered-receipts.ts`, `src/hooks/use-category-colors.ts`.
  - Shared UI: `src/components/{nav,filter-bar,multi-select,receipts-table,quick-add-modal,app-chrome,providers,theme-toggle}.tsx`.
  - Chart components: `src/components/charts/*` (stat-card, single-series-bar, stacked-category-bar, category-pie, category-line, category-month-heatmap, cumulative-extrapolation, chart-tooltip).
  - All 6 pages: `/` (Overview), `/daily`, `/monthly`, `/categories`, `/savings`, `/disbursements`.
  - Quick-add modal (new feature — the old app was read-only): floating button, Dialog on desktop / Drawer on mobile, Receipt + Disbursement tabs, `POST /api/receipts` and `POST /api/disbursements` (zod-validated, RLS-scoped).
  - `scripts/migrate-sqlite-to-supabase.ts` — one-time backfill script (not yet run — needs your Supabase credentials).
  - `.env.example`, rewrote `CLAUDE.md` for the new stack, moved `app.py`/`pages/`/`finance_tracker/`/`config.py`/`SPEC.md`/`.venv`/`requirements.txt`/`run.sh` into `legacy_streamlit/`.

## In progress

_Nothing — full build complete. Awaiting your setup steps below before it can actually run._

## Backlog — your steps to bring this online

These need your Supabase account access, which Claude doesn't have:

1. Create (or pick an existing) Supabase project. Enable Google + GitHub OAuth providers.
2. Run the schema SQL from `migration.md` §6 (creates the `finance_tracker` schema, tables, RLS policies).
3. In Supabase project settings, add `finance_tracker` to the exposed schemas for the API (it's not exposed by default — only `public` is).
4. Copy `.env.example` to `.env.local`, fill in `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. Run `pnpm install` (already done once during the build, but re-run to be sure), then `pnpm dev` and sign in once via `/login` — this creates your `auth.users` row.
6. Add your own single-user restriction in Supabase (RLS allow-list / provider config — your call how, per `migration.md` §5).
7. Get your `auth.users` id (Supabase dashboard → Authentication → Users) and run the migration script:
   `SQLITE_DB_PATH=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... MIGRATION_USER_ID=... pnpm migrate:sqlite-to-supabase`
   then run the two `setval(...)` statements it prints, in the Supabase SQL editor.
8. Run `pnpm dev` and click through all 6 pages + quick-add — this hasn't been runtime-tested yet (Claude can't run `pnpm dev`/`build` under this session's constraints). Report back anything broken.
9. When ready, deploy to Vercel (new project, same env vars as `.env.local` except `DATA_SOURCE`/`SQLITE_DB_PATH` which should stay unset in production).

## Follow-ups

- [ ] Edit/delete UI for existing rows — still out of scope, matches the old app's read-only-except-quick-add design.
- [ ] Confirm the Daily page's per-category (not per-receipt) stacked-bar aggregation is acceptable — see `migration.md` §14a.
- [ ] Confirm ISO-week bucketing (Mon-Sun) is fine for `/savings` and `/disbursements` weekly views — differs slightly from the old pandas `resample("W")` (Sunday-ending weeks). See `migration.md` §15.
- [ ] Decide whether the quick-add "refund of receipt" combobox should stay unscoped (searches *all* receipts) once the dataset grows large.
- [ ] TypeScript is pinned to latest-5.x (5.9.3) and ESLint to latest-9.x (9.39.5), not the newest majors (TS 7, ESLint 10) — see `migration.md`'s flagged decisions for why. Revisit once the ecosystem (`typescript-eslint`, `eslint-config-next`) catches up.
- [ ] A post-build code review (8-angle, see session log) surfaced cleanup-tier items left un-fixed by design (correctness bugs were fixed; these are quality/consistency only):
  - `src/app/monthly/page.tsx` reimplements the filter bar UI instead of extending `src/components/filter-bar.tsx` — `FilterBar` would need a way to swap its leading control (date range vs. month multiselect) to unify these.
  - `src/lib/dates.ts` hand-rolls week/day math; `date-fns` is already a dependency but unused anywhere in `src/`. Consider switching if a date-math bug ever surfaces.
  - Several small duplications: the bucket+category `Map`-accumulation pattern (daily/monthly pages), the `discount > 0 || discount_percentage > 0` predicate (also inlined in `lib/filters.ts`), the weekly/daily bucketing threshold logic (savings/disbursements pages), the refresh-button JSX, and the local table-filter-state pattern (`ReceiptsTable`, categories page, disbursements page) — none are bugs, just three-plus places to touch if the shared behavior changes.
  - `src/store/filters-store.ts`'s SSR-hydration approach (`skipHydration` + `FiltersHydrator`) has no `hasHydrated` gate exposed to consumers, so pages briefly render default filters before snapping to the persisted ones on load — a visible flash, not a data-loss bug.
  - `src/lib/data/source.ts`'s `getDataSource()` implicitly assumes it's called inside a Next.js request scope (needs `cookies()`); undocumented in the code itself, only in `CLAUDE.md`'s hard rules. `scripts/migrate-sqlite-to-supabase.ts` correctly bypasses it with its own client — worth a code comment if this bites someone later.

## Notes / gotchas

- `DATA_SOURCE=sqlite` mode requires `SQLITE_DB_PATH` and only works locally — `better-sqlite3`'s native binary isn't meant to run on Vercel.
- Categories are still free-text (not a DB enum) — the quick-add dropdown offers the 12 `CATEGORY_OPTIONS` (ported from the old Gooey script) plus "Other" for anything else, matching the old DB's tolerance for arbitrary category strings.
- Any inline chart styling must use the `--color-*` Tailwind-exposed CSS variables (e.g. `var(--color-border)`), not the raw HSL-component variables (`var(--border)`) that `globals.css` defines for `hsl()` wrapping — the raw ones aren't valid CSS colors on their own.
