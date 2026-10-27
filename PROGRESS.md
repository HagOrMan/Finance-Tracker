# PROGRESS.md

Current state and open work. **Update this as you go.** Durable "why" belongs in
`ARCHITECTURE.md`, not here — this file should stay short enough to read in full.

---

## State

**Built, deployed, and running against real data.** Every page, the write path,
stores/entities hygiene, the CRUD tables, subscriptions, and spending reports
are live. The SQLite→Supabase backfill has run; migrations
`finance_tracker_schema` through `003` have been applied. **`004_quick_adds.sql`
has not** — see Open #11.

Routes: `/` `/monthly` `/categories` `/savings` `/disbursements` `/reports`
`/reports/monthly` · `/stores` `/manage` `/subscriptions` `/quick-adds` behind
the "Manage ▾" menu.

**Quick adds** are saved presets (receipt or disbursement) shown as a row of
buttons at the top of each tab in the + sheet. Tapping one fills the form —
everything but the date — and nothing is written until Add. Invariants are in
`ARCHITECTURE.md` §5 "Quick adds".

**`/` is the daily breakdown.** The separate Overview page is gone — it was a
weaker version of the same view, so the page you wanted was never the one you
landed on. Its two figures worth keeping (avg / day, total refunded) joined the
stat row, which is now six cards. `/daily` survives as a `redirect("/")` so old
bookmarks and the docs' references still land somewhere.

`/reports/monthly` is reached by a link on `/reports`, **not** a `Nav` entry —
that row is at six inline links (seven before Overview was folded into `/`) and
its own comment flags an eighth as the one to watch.

**Reads are cached server-side** as of the caching pass: `src/lib/data/cache.ts`
puts Next's tagged Data Cache in front of every list read, write routes
invalidate by tag, and refetch-on-window-focus is off. See `ARCHITECTURE.md`
§3.1 — in particular the rule that every write route must call `invalidate*()`.

**A public demo build is deployed and live**, gated entirely behind
`NEXT_PUBLIC_DEMO_MODE` — a second Vercel project off `main` whose environment
holds that one variable and nothing else. Verified against the deployed URL, not
just localhost. Why it is shaped this way is in `ARCHITECTURE.md` §8; the audit
that produced it, and the checklist to re-walk after any change that touches the
data layer or auth, are in `guides/demo-mode-guide.md`. Where the code is:

| Piece | File |
| --- | --- |
| The flag — the only read of the env var | `src/lib/demo/flag.ts` |
| The seam — one ternary | `request()` in `src/hooks/use-finance-data.ts` |
| Route-handler stand-in, returns a real `Response` | `src/lib/demo/transport.ts` |
| Third `DataSource`, backed by `localStorage` | `src/lib/data/demo-source.ts` |
| Store and seed generator | `src/lib/demo/store.ts`, `seed.ts` |
| Boot gate and banner | `src/components/demo/` |
| The one auth bypass | top of `updateSession()` in `src/lib/supabase/middleware.ts` |

`guides/demo-mode-playbook.md` is the portable version of all this, for the
other repos. It is the file to update when something here turns out to have been
wrong — not this one.

## Open

1. **Monthly digest — written, not yet seen against real data.** Model, runner,
   email, cron branch, API routes and page are all in. The reasoning behind
   every decision is in `ARCHITECTURE.md` ("Monthly digest") — read that before
   changing any of it. What still needs a human:
   - **Re-read the email after the second density pass.** Two rounds so far:
     type up a step and the numeric grid replaced by a column chart per
     category (the table stays on the web, where it can scroll); then, after
     the rules still weren't visible, `EMAIL_COLORS.rule` for row separators,
     separators as filled cells rather than borders, 16px row padding, and the
     digest's own `section()` with a 3px section divider. `ROW_PADDING` and
     `MAX_CHART_CATEGORIES` in `src/lib/email/monthly-digest.ts` are the knobs.
   - **Most of the "the email looks unstyled" feedback was one bug**, not a
     design problem: `EMAIL_FONT` contained `"Segoe UI"`, whose double quotes
     terminated every `style="…"` attribute early and discarded font size,
     colour, weight and padding across **all three** email templates. Fixed in
     `layout.ts` (single quotes) and recorded in `ARCHITECTURE.md` §6. The
     density and weight passes made before this was found were never actually
     rendering; spacing has since been dialled back to what it was originally
     meant to be (`ROW_PADDING` 12px, 20px sections).
   - **All three templates have had the follow-up pass**, since all three were
     unstyled: `EMAIL_COLORS.border` is now only the card's outer edge and
     `EMAIL_COLORS.rule` is every line inside one, separators are filled cells
     rather than borders, and hint text sets `font-weight` explicitly so it
     doesn't inherit from the bold labels above it. **Send yourself a weekly
     report and trigger a subscription run** — nobody has seen either rendered
     correctly, so their spacing may want the same dial-back the digest needed.
   - **Gmail was collapsing sections behind a "…" expander** — thread grouping
     across repeated sends, not clipping. Fixed for *all three* email types by
     a unique `X-Entity-Ref-ID` header in `send.ts`. Worth confirming the
     weekly report and subscription-run mails still look right, since that
     change touched their send path too.
   - **Sanity-check the big-spender thresholds against a real month.** The
     $150 floor and the 3× category multiple are guesses until a month's rows
     are looked at; both are constants in `src/lib/config.ts`.
   - **Confirm the first 3rd-of-month firing** in the Vercel logs. The run JSON
     carries `monthlyDigest`, which reads
     `{ sent: false, subject: null, reason: "not-digest-day" }` on every other
     day — that line exists so a broken send is diagnosable rather than silent.
   - The projection needs a few complete months behind it before it says
     anything; below 5 usable months it falls back to the median and reports
     that it did.
2. **Read one cron firing's run JSON** in the Vercel function logs. On a
   non-Saturday it should carry
   `weeklyReport: { sent: false, subject: null, reason: "not-saturday" }` —
   that line exists so a broken Saturday is diagnosable rather than silent. Then
   confirm the first real Saturday send. This is the only thing deployment
   didn't immediately verify, because a firing arrives on the cron's timetable.
3. **`/manage` has no URL-driven filters**, so the `Sub` badge on generated
   receipts links nowhere. Giving that page query-param filter state is worth
   doing as one piece rather than as a one-off link.
4. **The Entities tab's row list is read-only.** `DisbursementEditor` exists and
   would drop straight in — it just never got wired into
   `entity-detail-modal.tsx`, while the Stores tab's equivalent rows open
   `ReceiptEditor`. Small, self-contained fix.
5. **The quick-add "refund of receipt" combobox searches all receipts**, which
   is fine at the current size. If it ever gets slow, the agreed shape is: show
   the most recent N by default, and only search the full history once ~3
   characters are typed.
6. **TypeScript is pinned to 5.x and ESLint to 9.x**, not the newest majors —
   `typescript-eslint` and `eslint-config-next` peer ranges hadn't caught up.
   Revisit when they have.
7. **Watch one Supabase egress figure after the caching pass.** The Data Cache
   should have collapsed most page loads to zero Supabase queries; the free
   tier's 5 GB/month was never close, but the number is now the way to tell the
   invalidation is firing rather than the one-hour backstop doing all the work.
8. **Vercel's Data Cache drops entries over ~2 MB.** Well beyond the current
   ledger, and it degrades to the old behaviour (a Supabase query per load)
   rather than breaking. Worth knowing before wondering why the cache
   "stopped working" years from now.
9. **Watch for forced re-logins.** Refresh-token rotation was turned off
   **2026-07-30**, after re-logins every day or two on the deployed site (never
   on localhost). Mechanism, trade-off and dashboard location are in
   `ARCHITECTURE.md` §2.1. **Nothing is confirmed yet** — give it 2–3 weeks,
   since the old cadence makes a clean fortnight the first real signal. Confirm
   rotation actually stopped by re-running the session query: token counts per
   session should stay at 1 instead of growing.
   - Dead ends, recorded so they aren't re-walked. "Enforce single session per
     user" is **off**. `auth.sessions.user_agent` / `.ip` hold the Node
     runtime's and Vercel's values, not the browser's, so they **cannot tell
     devices apart**. Cookie chunking is **not** the cause — a mis-reassembled
     cookie reads as *no session* and never reaches the token endpoint, so it
     cannot produce `refresh_token_not_found`. And dropping `access_type:
     "offline"` sheds ~480 encoded bytes of a ~4.9 KB cookie, nowhere near the
     3180 B chunk boundary: defensible as tidy-up, worthless as a fix.
   - Raising the access-token (JWT) expiry is **not** a substitute. Rotations
     are driven by *visits*, not by the clock — once the gap between visits
     exceeds the token lifetime, a visit costs one rotation at any expiry, so at
     a once-every-few-days cadence 3600 s and 48 h produce the same number. It
     helps consecutive-day use only, as a convenience.

10. **The navigation/UX pass is written but not compiled** (global constraint —
    no build or type-check was run). Run `pnpm tsc --noEmit` and `pnpm dev`,
    then look at four things:
    - **`/` in a narrow window.** Six stat cards go `2 → 3 → 6` across
      `sm`/`xl`; the "Biggest day (YYYY-MM-DD)" label is the one that will wrap
      badly if any breakpoint is wrong.
    - **Savings by category with every category present.** `longLabels` angles
      the ticks −30° and truncates at 18 chars with the full name in an SVG
      `<title>`; the chart grows 60px and takes a 68px bottom margin to fit
      them. Check nothing clips at mobile width.
    - **An existing receipt whose category is off-list.** `CategorySelect` no
      longer has a free-text option, and the off-list value is injected as an
      extra item — confirm it shows selected and survives a save.
    - **A subscription with a note, run through "Run due charges".** The
      generated receipt's note should be the subscription's note now; one
      *without* a note still falls back to its name, since a generated row with
      an empty note reads as anonymous in the receipts table. Say so if the
      preference is a literal empty note instead.
11. **Quick adds — written, never built or run.** To bring it up:
    - Run `supabase/migrations/004_quick_adds.sql` in the SQL editor **before
      deploying**, or `/api/quick-adds` 500s and the + sheet's preset row stays
      empty (the rest of the sheet still works).
    - Regenerate `src/types/database.ts`. The `quick_adds` entry was written by
      hand to match the generator's shape; the regenerated file should agree.
    - `pnpm tsc --noEmit`. The likeliest type errors are in `quickAddSchema`'s
      preprocess/transform and the `setValue("price", "")` calls in
      `quick-add-modal.tsx`.
    - On the phone: a preset with a blank amount should focus the amount field
      and raise the keypad. iOS only does that for a focus inside the tap's own
      handler, which this is, but it hasn't been seen.
    - The demo storage key went `v1` → `v2` for the new `quickAdds` array, so
      existing demo visitors get a fresh seed once.

## Settled

- **A Popover rendered inside a Dialog or Drawer must set `modal`.** The
  surrounding overlay holds a `react-remove-scroll` lock, and only the *topmost*
  lock on that library's stack handles wheel and touch events. A popover portals
  to `<body>` — outside the lock — so without one of its own, every wheel tick
  and every touch drag over its content is cancelled; only dragging the
  scrollbar works, which makes it look like a styling bug. This is why
  `receipt-link-combobox.tsx` sets `modal`. `multi-select.tsx` and `nav.tsx`
  don't need it: neither sits inside an overlay.
- **The "Refund of receipt" picker filters itself** (`shouldFilter={false}`)
  rather than letting cmdk do it. cmdk keeps every receipt mounted and re-scores
  the lot per keystroke, and the surviving list stayed tall enough to hold a
  stale `scrollTop`, so the best match sat off-screen above you. It now does a
  token-AND substring match over date/store/category, keeps the API's
  newest-first order, caps the rendered list at 50 (with a row saying so), and
  resets `scrollTop` by hand on every query change. Both call sites —
  `quick-add-modal.tsx` and `disbursement-editor.tsx` — share the one component
  now; they had drifted apart on popover width already.
- **The demo's cron handler keeps its 503, not the 200 the guide suggests.**
  `requireCronSecret()` already fails closed when `CRON_SECRET` is unset, and
  that direction is deliberate (`ARCHITECTURE.md` §2). Quieter logs in a project
  nobody reads the logs of is not worth weakening a fail-closed path for.
- **`curl`ing `/api/*` on the deployed demo returns 500, not 401** — the handler
  runs, reaches `requireEnv`, and throws with no Supabase credentials present.
  This is the visible cost of refusing to put a demo branch inside
  `requireOwnerForApi()`, and it is the right trade: nothing is behind the 500,
  because that environment holds no data and no secret to reach.
- **ISO-week bucketing (Mon–Sun) stays** on `/savings` and `/disbursements`,
  despite differing from the old Streamlit app's Sunday-ending pandas weeks.
- **The Daily chart draws one segment per receipt** (`daily-receipt-bar-chart.tsx`),
  matching the original Streamlit behaviour. `/monthly` deliberately keeps the
  category-summed `StackedCategoryBarChart` — 200 segments in a month bar is
  noise, not detail.
- **Date-range presets (7d / 30d / 90d / 1y) live in the shared
  `DateRangeField`, not on any one page.** They write two plain dates into the
  one filter every date-range page reads, so a preset that existed on only one
  page would be setting state the others can't see a control for. That is also
  why `/disbursements` now imports `DateRangeField` rather than keeping its own
  pair of date inputs — it reads the same two store fields, so it gets the same
  control. They are *trailing* windows ending **today**, unlike a report window,
  which ends yesterday so it never counts a day still being spent — a filter is
  looked through, not compared against a baseline. `/reports` stays period-only
  and filter-free (ARCHITECTURE.md): "gifts, past year, with the daily chart" is
  a question for `/`, and a report can't express it.
- **The date range is the one filter that doesn't persist.** Categories, stores,
  discount, net-paid, entities and disbursement type all survive a reload;
  `startDate`/`endDate` are re-derived from `defaultFilters` on every load, so a
  visit always opens on a trailing window ending **today**. A saved `endDate` is
  a snapshot of whenever you last opened the app, which quietly hides everything
  since. `filters-store.ts` enforces it from both sides — `partialize` stops
  writing the dates, `merge` drops any a previous version already wrote.

## Known non-issues

- **`JWT issued at future` on a *data* read is Supabase-internal clock skew.**
  Seen **2026-08-10** in dev, thrown by `loadDisbursements()` during a
  background `unstable_cache` revalidation while the request itself served 200.
  Diagnosed and closed as external:
  - That path runs on the **secret key**, not a session — `getDataSource()` →
    `createServiceClient()`. There is no refresh token and no rotation, so the
    refresh-race explanation written in `supabase/server.ts` and
    `supabase/middleware.ts` cannot be the cause here. (Those mitigations are
    still right; the sentence "a refresh race, **not a clock problem**" is the
    part that's wrong — both paths are ultimately a freshly-issued token
    reaching a validator whose clock lags the signer.)
  - This project uses the **new opaque keys** (`sb_secret_…` /
    `sb_publishable_…`). Kong swaps those for a gateway-signed ES256 JWT before
    PostgREST sees them, so *every* request now carries a gateway-issued token —
    which is why this can now appear on the data path and not just at login.
  - PostgREST allows **30 s** of skew on `iat` and rejects anything beyond it.
    Nothing in this repo mints that token, and the dev machine measured **0 s**
    against the Supabase edge, so the skew is between Supabase's own gateway and
    its PostgREST instance. Transient; not actionable from here.
  - **Three follow-ups, all done.** Every throw in `supabase-source.ts` now goes
    through `failed()`, which appends the `PGRST…` code — that was the missing
    half of the log line. `cache.ts` retries once, reads only, on a message
    matching `issued at future`; it is a *fresh draw* at a possibly-unskewed
    instance, not a wait, since the retry gets a newly minted token with a new
    `iat`. And the "a refresh race, **not** a clock problem" sentence in
    `supabase/server.ts` was amended — the race is the trigger, the skew is the
    mechanism, and the mitigations there and in `middleware.ts` are unchanged.
  - Still true after all that: if *every* instance behind the gateway is skewed,
    a foreground read on a cold cache 500s the route. This one was harmlessly
    swallowed by background revalidation.
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
- **`ReceiptsTable` sorts client-side over the whole filtered array**, which is
  right at this ledger's size and would need rethinking (server-side ordering,
  or virtualisation) only if a single view ever held tens of thousands of rows.
- **`ReceiptsTable`'s `limit` prop has no caller** since the Overview page (its
  only one) was folded into `/`. Kept rather than deleted because a preview
  slice is a plausible next need and the footer-suppression logic that goes with
  it is the non-obvious half. Delete it if nothing wants it in a year.
- **`SingleSeriesBarChart`'s `longLabels` is only on savings-by-category.**
  `/disbursements`' "By entity" chart has the same long-name risk and would
  take the same one-word prop; it just wasn't asked for.
- Small duplications: the bucket+category `Map` accumulation (now only within
  `/monthly`, twice — the daily page no longer does it), the
  `discount > 0 || discount_percentage > 0` predicate, the weekly/daily
  bucketing threshold shared by `/savings` and `/disbursements`, the local
  table-filter-state pattern in three tables, and `/monthly`'s hand-rolled
  `subtractRefunds ? "Net paid ($)" : …` (now `priceLabel()` in `filters.ts`).
- ~~`src/store/filters-store.ts` exposes no `hasHydrated` gate.~~ **Done** —
  the store carries `hasHydrated` (not persisted), `FiltersHydrator` flips it
  after `rehydrate()` resolves, and `useFilteredReceipts` folds it into
  `isLoading` so the four pages using that hook get it for free. `/monthly` and
  `/disbursements` read the store directly and fold it in themselves. The
  filter *controls* still snap from defaults to saved values for one frame —
  that's deliberate, since hiding the bar until hydration would shift the
  layout, and the numbers are what mattered.
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
