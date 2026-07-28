# PROGRESS.md

Current state and open work. **Update this as you go.** Durable "why" belongs in
`ARCHITECTURE.md`, not here — this file should stay short enough to read in full.

---

## State

**Built, deployed, and running against real data.** Every page, the write path,
stores/entities hygiene, the CRUD tables, subscriptions, and spending reports
are live. The SQLite→Supabase backfill has run; all three migrations in
`supabase/migrations/` have been applied.

Routes: `/` `/daily` `/monthly` `/categories` `/savings` `/disbursements`
`/reports` · `/stores` `/manage` `/subscriptions` behind the "Manage ▾" menu.

## Open

1. **Read one cron firing's run JSON** in the Vercel function logs. On a
   non-Saturday it should carry
   `weeklyReport: { sent: false, subject: null, reason: "not-saturday" }` —
   that line exists so a broken Saturday is diagnosable rather than silent. Then
   confirm the first real Saturday send. This is the only thing deployment
   didn't immediately verify, because a firing arrives on the cron's timetable.
2. **`/manage` has no URL-driven filters**, so the `Sub` badge on generated
   receipts links nowhere. Giving that page query-param filter state is worth
   doing as one piece rather than as a one-off link.
3. **The Entities tab's row list is read-only.** `DisbursementEditor` exists and
   would drop straight in — it just never got wired into
   `entity-detail-modal.tsx`, while the Stores tab's equivalent rows open
   `ReceiptEditor`. Small, self-contained fix.
4. **The quick-add "refund of receipt" combobox searches all receipts**, which
   is fine at the current size. If it ever gets slow, the agreed shape is: show
   the most recent N by default, and only search the full history once ~3
   characters are typed.
5. **TypeScript is pinned to 5.x and ESLint to 9.x**, not the newest majors —
   `typescript-eslint` and `eslint-config-next` peer ranges hadn't caught up.
   Revisit when they have.

## Settled

- **ISO-week bucketing (Mon–Sun) stays** on `/savings` and `/disbursements`,
  despite differing from the old Streamlit app's Sunday-ending pandas weeks.
- **The Daily chart draws one segment per receipt** (`daily-receipt-bar-chart.tsx`),
  matching the original Streamlit behaviour. `/monthly` deliberately keeps the
  category-summed `StackedCategoryBarChart` — 200 segments in a month bar is
  noise, not detail.

## Known non-issues

- **Gmail's message-list column shows the bare sender address** rather than
  "Finance Tracker", even with the address in Contacts and the name rendering
  correctly in the opened message. The `From` header is right; Gmail resolves
  the list column against its own index. Nothing to fix.

## Cleanup backlog

Quality only — no bugs. Noted so they aren't rediscovered as findings.

- ~~`src/app/monthly/page.tsx` reimplements the filter bar.~~ **Done** —
  `FilterBar` takes an optional `leading` node that replaces the date-range
  inputs; `/monthly` passes its month multiselect. `/disbursements` keeps its
  own bar on purpose: its filter set is different rather than reordered, so
  folding it in would mean making nearly every control optional.
- ~~`src/lib/dates.ts` hand-rolls week/day math; `date-fns` is unused.~~
  **Resolved the other way** — `date-fns` removed rather than adopted. It works
  on `Date` objects in local time, which is exactly the off-by-one this app's
  string-based dates exist to avoid, and `todayInZone` has no equivalent
  without `date-fns-tz`. Reasoning is recorded at the top of `dates.ts` so it
  doesn't get re-raised.
- Small duplications: the bucket+category `Map` accumulation (now only within
  `/monthly`, twice — `/daily` no longer does it), the
  `discount > 0 || discount_percentage > 0` predicate, the weekly/daily
  bucketing threshold shared by `/savings` and `/disbursements`, and the local
  table-filter-state pattern in three tables.
- `src/store/filters-store.ts` exposes no `hasHydrated` gate, so pages briefly
  render default filters before snapping to the persisted ones. The most
  user-visible of these.
- ~~`getDataSource()` doesn't document that it no longer needs a request
  scope.~~ **Not real** — its docblock already says so.

## Operational notes

- **Every new env var must be mirrored into Production, Preview *and*
  Development** in Vercel. Auth working locally but 401ing on Vercel is almost
  always this.
- **After any schema change**, re-run
  `npx supabase gen types typescript --project-id <ref> --schema public --schema finance_tracker`
  and take the output verbatim (see the `database.ts` trap in
  `ARCHITECTURE.md` §6).
- **`finance_tracker` must stay in Supabase's exposed-schemas setting** or every
  request 404s. Only `public` is exposed by default.
- Don't add a second Supabase keep-alive cron — the personal-website project's
  covers this one.
- `DATA_SOURCE=sqlite` needs `SQLITE_DB_PATH` and works locally only;
  `better-sqlite3`'s native binary isn't meant for Vercel.
