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

**Reads are cached server-side** as of the caching pass: `src/lib/data/cache.ts`
puts Next's tagged Data Cache in front of every list read, write routes
invalidate by tag, and refetch-on-window-focus is off. See `ARCHITECTURE.md`
§3.1 — in particular the rule that every write route must call `invalidate*()`.

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
6. **Watch one Supabase egress figure after the caching pass.** The Data Cache
   should have collapsed most page loads to zero Supabase queries; the free
   tier's 5 GB/month was never close, but the number is now the way to tell the
   invalidation is firing rather than the one-hour backstop doing all the work.
7. **Vercel's Data Cache drops entries over ~2 MB.** Well beyond the current
   ledger, and it degrades to the old behaviour (a Supabase query per load)
   rather than breaking. Worth knowing before wondering why the cache
   "stopped working" years from now.
8. **Forced re-logins every day or two, on both phone and laptop.** Not Supabase
   ending the session — `auth.sessions` says the opposite. Nothing is ever
   terminated (terminated sessions are *deleted*, and no row has ever vanished),
   token chains show plain healthy rotation (N tokens, N−1 revoked), and the
   laptop was forced to re-auth while its own session sat there alive and
   un-revoked. Sessions accumulate because each forced login abandons a live one
   instead of replacing it. So **the browser is losing the cookie**, not the
   server ending the session — which also rules out the reuse-detection theory,
   since that revokes only the one session anyway, never a sibling device.
   - Two dead ends, recorded so they aren't re-walked: "Enforce single session
     per user" is **off**, and `auth.sessions.user_agent` / `.ip` are the Node
     runtime's and Vercel's, not the browser's — the session is created
     server-side by `exchangeCodeForSession`, so those columns **cannot tell
     devices apart** here.
   - **The observed error is `Invalid Refresh Token: Refresh Token Not Found`**,
     and it is the deduction that matters. GoTrue distinguishes it from
     `Already Used`: the latter means the token exists, is revoked, and reuse
     detection fired — which *terminates the session and deletes the row*.
     `Not Found` means GoTrue has no record of the token, so there is no session
     to terminate, which is the only refresh failure that leaves a row alive,
     un-revoked and orphaned. That is exactly the observed shape. **Reuse
     detection and the whole concurrent-refresh-race family are ruled out** —
     they all surface as `Already Used`. The browser is presenting a refresh
     token the server has never heard of.
   - **Cookie chunking is not the cause** (demoted from leading theory). A
     mis-reassembled cookie fails base64/JSON parsing and reads as *no session*,
     which never reaches the token endpoint at all — it cannot produce this
     error. The cookie is still chunked (`.0` 3216 B + `.1` 1719 B), and it will
     stay that way: measured payload is `user` 1734 B, `access_token` 1384 B,
     `provider_token` 255 B, `provider_refresh_token` 105 B, `refresh_token`
     14 B. Unchunking needs ~1.3 KB shed and only the first two are big enough,
     so it isn't reachable.
   - **Resolved: dropping `access_type: "offline"` is not a fix.** It removes
     360 raw bytes (~480 encoded) of a ~4.9 KB cookie — nowhere near a chunk
     boundary. Still defensible as tidy-up (nothing reads the provider tokens,
     no Google API is ever called, and `@supabase/ssr` sets `httpOnly: false`
     so a Google refresh token currently sits in a JS-readable cookie) but it
     buys nothing for the logouts.
   - **Done:** both discarded-error blind spots now report through
     `logAuthFailure()` in `src/lib/supabase/auth-log.ts` — the proxy, and
     `getSessionUser()`, which is the gate on every page and route handler.
     Grep the Vercel function logs for `[auth]`. Separately, the swallowed
     cookie write in `src/lib/supabase/server.ts` is a real route *into* this
     bug and its comment used to claim the proxy recovered it. The comment is
     now honest; the swallow itself still has to stay.
   - **There is no "Advanced" auth section** — the knobs live under Auth →
     Sessions → Refresh Tokens. "Detect and revoke potentially compromised
     refresh tokens" is the rotation switch despite the security-flavoured
     label: off means the same refresh token keeps working, and the failure
     chain above cannot start. "Refresh token reuse interval" is a seconds-wide
     grace window and is useless here — the gap in this bug is days.
   - The other lever is the **access-token (JWT) expiry**, 3600 s by default.
     Cutting the number of refreshes cuts the exposure proportionally, and it
     costs less in this app than in most: every check goes through `getUser()`
     against the Auth server rather than trusting the JWT locally, so a longer
     JWT does not blunt the `OWNER_USER_IDS` gate.
   - Separate but adjacent: `signOut()` in `src/lib/supabase/actions.ts` takes
     supabase-js's default `scope: "global"`, which revokes *every* device's
     refresh token — signing out on the laptop really does sign the phone out.
     `{ scope: "local" }` if that's unwanted.

## Settled

- **ISO-week bucketing (Mon–Sun) stays** on `/savings` and `/disbursements`,
  despite differing from the old Streamlit app's Sunday-ending pandas weeks.
- **The Daily chart draws one segment per receipt** (`daily-receipt-bar-chart.tsx`),
  matching the original Streamlit behaviour. `/monthly` deliberately keeps the
  category-summed `StackedCategoryBarChart` — 200 segments in a month bar is
  noise, not detail.
- **Date-range presets (7d / 30d / 90d / 1y) live on the shared `FilterBar`, not
  on `/daily` or `/reports`.** They write two plain dates into the one filter
  every date-range page reads, so a preset that existed on only one page would
  be setting state the others can't see a control for. They are *trailing*
  windows ending **today**, unlike a report window, which ends yesterday so it
  never counts a day still being spent — a filter is looked through, not
  compared against a baseline. `/reports` stays period-only and filter-free
  (ARCHITECTURE.md): "gifts, past year, with the daily chart" is a `/daily`
  question, and a report can't express it.
- **The date range is the one filter that doesn't persist.** Categories, stores,
  discount, net-paid, entities and disbursement type all survive a reload;
  `startDate`/`endDate` are re-derived from `defaultFilters` on every load, so a
  visit always opens on a trailing window ending **today**. A saved `endDate` is
  a snapshot of whenever you last opened the app, which quietly hides everything
  since. `filters-store.ts` enforces it from both sides — `partialize` stops
  writing the dates, `merge` drops any a previous version already wrote.

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
- **`ReceiptsTable` sorts client-side over the whole filtered array**, which is
  right at this ledger's size and would need rethinking (server-side ordering,
  or virtualisation) only if a single view ever held tens of thousands of rows.
  Its footer total is suppressed when `limit` is set, so the overview's top-10
  slice never shows a total of an arbitrary ten.
- Small duplications: the bucket+category `Map` accumulation (now only within
  `/monthly`, twice — `/daily` no longer does it), the
  `discount > 0 || discount_percentage > 0` predicate, the weekly/daily
  bucketing threshold shared by `/savings` and `/disbursements`, and the local
  table-filter-state pattern in three tables.
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
