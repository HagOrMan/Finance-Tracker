# ARCHITECTURE.md

Why this app is shaped the way it is, and the invariants that must survive
future work. `CLAUDE.md` is the entry point and holds the operational rules;
`PROGRESS.md` holds current state and open work. This file changes rarely.

Not repeated here: anything the code already states. Schema lives in
`supabase/migrations/*.sql`, env vars in `.env.example`, types in
`src/lib/data/types.ts`, and the tricky functions carry their own docblocks.

---

## 1. The governing principle

> **`receipts` is the ledger of facts. Everything else is either a generator
> that writes into it, or a lens that reads it.**

Consequences, each of which is load-bearing somewhere:

- A **subscription** is a schedule. It generates receipts; nothing in the app's
  math ever reads a subscription. This is why adding subscriptions required zero
  changes to any chart, filter or total.
- A **store's category** is an observation over receipts, not a stored mapping.
  "Fixing" a store rewrites receipts. There is deliberately no store→category
  defaults table.
- A **report** is a lens: it writes nothing, stores nothing, and owns no table —
  not even a "last sent" timestamp.
- **Price history needs no table.** Past charges are receipts, and receipts are
  facts. A subscription only knows its current price.

The recurring temptation is to add a second place that knows what something
costs, or when something last happened. Don't.

---

## 2. Auth and data access — Pattern A

**The finance tables are server-only and secret-key-only.** Nothing in the
browser ever talks to Supabase. Reads and writes go route handler →
`getDataSource()` → `src/lib/supabase/service.ts`.

The Supabase project is **shared with the user's other apps**, so `auth.users` is
a shared pool: a valid session proves identity, not access.

| Layer | What it does |
| --- | --- |
| `anon` / `authenticated` grants | None on `finance_tracker` — a request with the public anon key gets `42501` |
| RLS | Enabled with **zero policies**, as a backstop |
| `OWNER_USER_IDS` | The **only** authorization gate. Fails closed when empty |
| `src/proxy.ts` | UX only — redirects navigation. Not a security boundary |

Because queries arrive as `service_role`, the database cannot tell one caller
from another. **There is no backstop behind `requireOwnerForApi()`.** Every route
handler starts with it and every page/Server Action with `requireUser()`, both
from `src/lib/auth-server.ts`. A handler that omits the call is public.

Don't add RLS policies — under `service_role` they are dead code, and wanting
one means the model changed.

**Exactly one exception, and no third gate:** `GET /api/cron/subscriptions`. A
Vercel cron carries no session, so it gates on a timing-safe `CRON_SECRET`
bearer and **503s when the secret is unset** (off, not open). It is
correspondingly the only `/api` entry in the proxy's `PUBLIC_PATHS` — without
that, the deny-by-default proxy would 401 the cron before the handler ran and
the schedule would silently never fire.

`SUPABASE_SECRET_KEY`'s blast radius is full read/write/delete. It is reachable
only through `service.ts`, which is `server-only`, so a client-component import
is a build error rather than a leaked key.

### 2.1 Refresh-token rotation is deliberately OFF

**This lives in the Supabase dashboard, not in this repo** — Auth → Sessions →
Refresh Tokens → *"Detect and revoke potentially compromised refresh tokens"*.
Nothing here enforces it and no amount of grepping will find it, which is why it
is written down: if unexplained forced sign-ins ever return, check that toggle
before anything else.

With rotation on, every refresh mints a new refresh token and revokes the old
one. That is only safe if the response carrying the new token actually reaches
the browser. On the deployed site it frequently didn't — a laptop sleeping
mid-request, a phone backgrounding the tab, a dropped mobile connection — and
the browser was left holding a token the Auth server had already retired. The
next visit failed with `refresh_token_not_found` and a forced sign-in, roughly
every day or two.

The tell was that it **never once happened on localhost**: one process, no
latency, responses always arrive. A session bug would not care where it runs.
(Relatedly, the single-flight in `src/lib/supabase/middleware.ts` genuinely
dedupes locally and is only best-effort on Vercel, where the proxy spans
instances.)

What rotation buys is *detecting a stolen refresh token*. Weighed against a
single-user app with Google-only sign-in, an `OWNER_USER_IDS` allowlist and no
third-party scripts, the reliability cost was not worth it. Two things back that
up:

- `signOut()` keeps supabase-js's default `scope: "global"`, revoking every
  refresh token on every device. That default is **kept on purpose** — it is the
  kill switch if compromise is ever suspected. It also means signing out on one
  device signs out the others, which is a real cost, accepted for that reason.
- Both places that check a session now report failures through
  `logAuthFailure()` (`src/lib/supabase/auth-log.ts`) instead of silently
  treating "the check failed" as "signed out". Grep the function logs for
  `[auth]`.

---

## 3. Data layer

`src/lib/data/` is the only place that touches Supabase or SQLite. Pages call
`src/hooks/use-finance-data.ts`; server code calls `getDataSource()`.

`DATA_SOURCE` picks the source — `supabase` (always, in production) or `sqlite`
for offline dev. `SqliteDataSource` **throws** on every subscription method
rather than returning `[]`: an empty list would make the page look empty rather
than unavailable.

**Update payloads are built only from `parsed.data`, never the raw body.** zod
strips unknown keys, and that is the entire mechanism keeping `id`,
`created_at`, `updated_at` and `subscription_id` unpatchable.

### 3.1 Caching — two layers, one rule

Reads pass through **two** caches, and the rule for both is the same:
correctness comes from *invalidation on write*, never from a short expiry.
Nothing but this app writes the ledger, so nothing can go stale behind its back.

| | Where | Lives for | Invalidated by |
|---|---|---|---|
| **Server** | `src/lib/data/cache.ts` (Next Data Cache, tagged) | 1 h backstop | `invalidate*()` in the write route |
| **Browser** | TanStack Query (`src/components/providers.tsx`) | 5 min stale / 30 min gc | `onSuccess` in the mutation hook |

Consequences worth knowing:

- **Reads that only display go through `src/lib/data/cache.ts`. Anything that
  writes — or decides a write — keeps calling `getDataSource()` directly.** The
  subscription runner, the delete guards and the bulk updates all read
  uncached, because a writer acting on a stale price cannot be fixed by
  invalidating afterwards.
- **Every write route calls the matching `invalidate*()` before responding.**
  There is no decorator enforcing it; a route that forgets serves stale rows
  for up to an hour. `CLAUDE.md` states this as a hard rule for the same reason.
- **`?fresh=1` bypasses the server cache and drops the entry**, and is used by
  exactly one caller: the Refresh button. Without it a refresh would clear only
  the browser cache and be handed the same server-cached payload back.
- **Refetch-on-window-focus is off.** It was the largest source of redundant
  Supabase reads — an alt-tab back into the app re-read the whole ledger — and
  it can only ever find changes this app didn't make.
- **Receipts and disbursements are two cache entries, merged per request.**
  Caching the merged result instead would mean every disbursement edit also
  threw away the receipts. Reports read the same two entries via
  `loadLedgerCached`, which is what took a report request from three Supabase
  queries to zero.

---

## 4. Conventions

- **Dates are plain `"YYYY-MM-DD"` strings**, compared lexicographically or via
  `src/lib/dates.ts`'s explicit-UTC helpers. `new Date("YYYY-MM-DD")` parses as
  UTC midnight and displays as the previous day west of Greenwich. That is also
  why there is **no date library**: date-fns and friends operate on `Date` in
  local time, so adopting one reintroduces the exact bug the convention
  prevents. Fix date bugs in `dates.ts`.
- **`todayISO()` uses the server's local zone; `todayInZone(APP_TIMEZONE)` is
  for anything scheduled.** On Vercel the server is UTC, so a cron would
  otherwise date things a day early.
- **`src/lib/colors.ts` is the only source of category colour**, via
  `useCategoryColors` in the app and `buildCategoryColorMap` server-side.
- **Money:** `actual_price = price - total_refunded`, where `total_refunded`
  only sums disbursements with a non-null `refunded_from_receipt`. The net-paid
  toggle defaults on. Reports are always net, with no toggle.
- **Savings:** `price` is post-discount, so
  `savings = discount + price × pct / (100 - pct)`, guarded at `pct = 100`.
- **Filters** live in a Zustand store persisted to `localStorage`, so they
  survive navigation. Default range is the last 30 days. `resetFilters()`
  restores *every* filter, not just the current page's — they are one shared
  object, and a per-page reset would leave another page still narrowed while
  its bar claimed otherwise.
- **Reset filters and Refresh data are different buttons and must stay visibly
  different** (`src/components/filter-actions.tsx`). Reset changes what you are
  looking at and touches no data; Refresh changes what the app knows and
  touches no filters. Reset is labelled and filter-shaped, Refresh is the
  circular arrow that spins while it works.
- **Category presets write a concrete selection**, they are not a live rule.
  "Common spending" (`commonSpendingCategories`) selects everything except the
  report's `COMPARISON_EXCLUDED_CATEGORIES`, reusing `isExcludedCategory` so
  "same as the email" is true by construction. A category added later is not
  swept in silently — press the preset again.
- **`DateRangeField` is the one date-range control**, exported from
  `filter-bar.tsx` and used both inside `FilterBar` and by `/disbursements`,
  which keeps its own bar but scopes by the same two store fields. Both dates
  and the 7d/30d/90d/1y quick-picks therefore behave identically everywhere.
  At most one instance mounts per page, which is what makes its fixed
  `filter-start` id safe.
- **`CategorySelect` has no free-text option.** Categories are free text in the
  database — the list is a convenience, not a constraint — but a hand-typed
  category becomes its own colour and its own bar on every chart for the sake
  of one receipt, so the picker offers only `CATEGORY_OPTIONS` (which ends in a
  literal "Other"). A row whose stored category is off-list keeps it: the value
  is injected as an extra item so opening and saving can't silently rewrite it.
- `/stores`, `/manage` and `/reports` deliberately have **no `FilterBar`** — the
  first two are lenses over the whole ledger (a 30-day default would hide the
  two-year-old mis-filed receipt you came for), and a report's window is defined
  by its period.

---

## 5. Feature invariants

### Receipts and disbursements

- **Receipt delete is a hard delete, blocked with 409** when disbursements
  reference it, with the blocking rows in the payload. A cascade would silently
  destroy refund records; a soft delete would cost a filter in every read path
  forever.
- **There is deliberately no bulk-delete endpoint.** The 409 guard is per-row by
  nature; a set-based delete would either fail a whole batch over one linked
  receipt or silently skip it. `src/lib/bulk-delete.ts` loops the single-row
  endpoint **sequentially**, and failures stay selected afterwards.
- Editing a disbursement is the more dangerous of the two edits: `amount` and
  `refunded_from_receipt` feed `actual_price` everywhere.
- **Refund vs standalone is a page-level filter on `/disbursements`**, in the
  bar rather than over the table, so it scopes the stat cards and both charts
  too. The predicate is `refunded_from_receipt != null` — the same one
  `mergeReceipts` uses, not a separate "kind" column that could disagree. With
  it set, the "Refunds" and "Standalone income" cards read $0 for the excluded
  side; the cards describe what's on screen, not the whole ledger.

### Charts

- **The daily breakdown (`/`, the landing page) draws one stacked segment per
  receipt; `/monthly` sums by category.** Recharts stacks by `dataKey`, so per-receipt segments need a key
  per receipt-slot. Keys are `(category, nth occurrence that day)` rather than
  stack position — every series then holds one category, its fill is a
  constant, and no `shape` render prop is needed. The legend is given an
  explicit per-category payload so it doesn't list the same category once per
  slot.
- Receipts worth ≤ 0 net (fully refunded) are omitted from the Daily chart —
  they contributed nothing, and a negative segment breaks the stack's geometry.
  They remain in the table below it.
- Bar tooltips in Recharts are driven by the x-axis category, so the Daily
  tooltip knows which *day* is hovered, not which segment. It lists the day's
  receipts, which is what the hover was asking anyway.

### Stores and entities (`/stores`)

Two-tier grouping, in `src/lib/name-groups.ts`:

1. **Automatic** (`nameGroupKey`) — trim, lowercase, collapse whitespace only.
   There is no reading of `"Netflix"` and `" netflix "` as different stores.
2. **Suggestion-only** (`nameSimilarityKey`) — accents, legal suffixes, TLDs,
   store numbers. Never applied automatically; auto-merging "Sobeys" and "So
   Beys" would be a silent data change.

`src/lib/stores.ts` and `entities.ts` are two aggregates over one similarity
implementation.

### Subscriptions

- **Recurrence is derived, never accumulated.** `nthChargeDate` computes the nth
  occurrence *from `start_date`*, so a 31st-of-the-month subscription clamps to
  Feb 28 and returns to Mar 31. Repeatedly adding a month would drift it to the
  28th permanently the first time it passed February.
- **The runner catches up; it never asks "is today the day".** A skipped day
  self-heals, a double run is a no-op, a failed insert retries tomorrow, and a
  first run and a backfill are the same code path.
- **`unique (subscription_id, date)` is the idempotency guard**, in the database
  rather than in application logic.
- **A per-run cap of 60 bounds a mistyped `start_date`.** The create form
  projects the backfill before you save, because silent backfill of a mistyped
  date is the worst failure mode the feature has.
- The **Overdue badge is the real safety net**, not the email — a subscription
  still overdue a day later means the cron isn't running.
- **A generated receipt's `note` is the subscription's note, falling back to its
  name.** The note is what you wrote *about* the subscription, so it is what
  every charge it generates should say; the name is the fallback for the
  un-noted ones, because a generated row still has to read as itself in the
  receipts table. `subscription_id` remains the machine-readable provenance and
  is unaffected. Both `SupabaseDataSource.insertSubscriptionCharge` and the
  demo source's copy must agree, and `src/lib/demo/seed.ts` seeds the same way
  so the demo's history matches what a run would write.

### Reports (`/reports`)

- **One window rule: the N days ending yesterday**, N = 7/30/365. Run on a
  Saturday, the weekly window *is* last Sat→Fri. Ending yesterday because today
  is still being spent.
- **Only the cron knows about Saturday.** The builder takes a period and a date
  and has no opinion about the calendar, which is what lets the same code path
  serve the on-demand button on a Tuesday.
- **Baselines that predate the ledger are dropped, not counted as zero** —
  otherwise the app's own age reads as a spending increase. `usableBaselines` is
  what the label counts.
- **`changeVsBaseline` is `null`, never `Infinity` or `NaN`.** Renderers print
  "no baseline" — never `0%`, which reads as "unchanged".
- **Travel / School / Rent** (`COMPARISON_EXCLUDED_CATEGORIES`) are held out of
  the headline and both sides of every comparison, then reported separately with
  an all-in total. Matching goes through `nameGroupKey`. It is policy, not data:
  changing the list changes past reports on re-render, which is correct, because
  the email is a photograph and the ledger is the subject.
- **Received counts only disbursements with no `refunded_from_receipt`** — a
  refund already reduced the spend figure.
- **The page fetches the model rather than aggregating its cached rows**, which
  it could do for free. `APP_TIMEZONE` is server-only, so a browser-built report
  could show a different week than the one that gets mailed.
- **`POST /api/reports/send` takes only `{ period }`.** Numbers in an email you
  will act on must not have come from a browser.
- **Sends every Saturday including zero-spend weeks, and never catches up.**
  Always sending makes a silent Saturday mean "the cron is broken". Catching up
  would need persisted state, which would make a lens into a generator.
- `src/lib/reports.ts` is pure and does no I/O; `reports-runner.ts` loads. That
  split is what makes the model checkable by hand against literal arrays.

### Monthly digest (`/reports/monthly`)

A second lens, not a fourth period. Same pure-model/runner split, same shared
primitives, different question: `/reports` asks "how was the last N days", the
digest asks "what did last month cost and what should I expect next".

- **A calendar month cannot be a `REPORT_PERIODS` entry.** `SpendingReport` is
  coherent precisely because every window is the same length — `currentWindow`
  and `precedingWindows` both take a fixed `days`, and every comparison on the
  type assumes it. Calendar months are 28–31 days. `src/lib/monthly-digest.ts`
  is therefore its own pure model, sharing `isExcludedCategory`, `nameGroupKey`,
  `computeSavings` and the format helpers, so neither type grows a nullable
  field for the other's sake.
- **Totals are actual, never normalized per day.** Rent and subscriptions are
  charged per month regardless of its length, so a per-day rate would be wrong
  for exactly the largest rows. February reads low; that is true, not an artifact.
- **No "ending yesterday" rule.** A completed calendar month contains no partial
  day, which is the entire reason the weekly window ends yesterday.
- **Sends on the 3rd, not the 1st.** Receipts are entered as they happen, so the
  last days of a month are the least likely to be on the ledger when it closes.
  Two days of grace costs nothing — the lookback is fixed either way — and a
  report is a lens, so a receipt entered late is silently absent forever rather
  than retroactively corrected.
- **The 3rd is a Saturday roughly one month in seven, and both emails send.**
  Suppressing either would break the rule the weekly report leans on: that a
  silent Saturday means the cron is broken.
- **The headline is net position** (received − all-in), with habitual and all-in
  directly beneath. Habitual spend alone cannot answer how much of a year's
  savings the year is consuming.

**What is projected, and what is deliberately not:**

- **Nothing entered by hand on no schedule is projected.** Income arrives when
  it arrives; rent is paid ad hoc and is not a subscription. Both are reported
  as observed figures only. Projecting income would be actively misleading —
  term-time hours are structurally lower than summer, so any average over recent
  months overestimates income exactly when the projection matters most.
- **The projection is habitual variable spend plus subscriptions, and says so.**
  Subscription charges are *computed* from `nthChargeDate`, not estimated —
  the schedule is known. The total carries an explicit "excludes rent, school,
  travel" label so a figure omitting the largest cost can never read as a cost
  of living.
- **Trimmed mean over 6 months, falling back to the median below 5 usable ones.**
  Drop-high-drop-low leaves 4 of 6; trimming 2 of 3 points is not an estimator.
  Each figure reports which rule produced it. Linear regression was rejected: on
  6–12 noisy monthly points the slope's standard error is large, and
  extrapolating it produces confident nonsense.
- **One-offs are stripped from the baseline, then reported as their own monthly
  average.** "Unforecastable" is not "won't happen" — a budget built from
  habitual spend alone is short every time a car repair lands.
- **The buffer is explained under Big spenders, not under the projection it
  modifies.** A one-off is *exactly* a big spender in a habitual category that
  isn't a subscription, so that table is the evidence for the number. `oneOffs`
  carries total, count and months rather than just the mean, because "set aside
  $210" is an assertion until it says what it counted.
- **Multi-month spreads widen as √n·sd, not n·sd.** Monthly deviations are close
  to independent and partly cancel, so scaling the range linearly overstates the
  4-month figure by roughly 2×. That total is the number actually budgeted
  against, so its spread has to be right.

**Big spenders** replaces the excluded-categories strip:

- **A union of three rules, each row stating which one it hit** — over an
  absolute floor; or ≥3× its own category's trailing-12-month *median* receipt
  (the mean would be dragged by the very outlier being detected); or ≥5% of
  all-in. The stated reason is the point: a bare threshold cannot explain why a
  brake job belongs next to rent.
- **A percentile was rejected.** At ~50 receipts a month the top 5% is 2–3 rows
  by construction, so it answers "which were biggest" — always answerable —
  rather than "was anything unusual", whose honest answer is sometimes no.
- **Clustering was rejected as scale-free.** In a quiet month a 1-D split
  cheerfully separates $18 from $12 and calls the grocery run big. Any usable
  version needs an absolute floor anyway, at which point it earns little.
- **Subscription-generated receipts are exempt from the relative and share
  rules.** A recurring charge is the definition of not-a-one-off, and it must
  not be stripped from the forecast baseline, because it recurs.
- **Travel/School/Rent get no separate section here.** They are always big
  spenders, so they are itemized in this one table with an inside/outside-
  habitual marker. The same dollars never appear in two tables.
- **No subtotals under the table.** The per-row badge already says which side
  of the habitual figure a row sits on; repeating it as an in-habitual /
  excluded split invited adding the two together, and an all-in footer could
  only ever restate `net.allInSpent` from the headline.

**Top stores counts habitual spend only.** All-in would rank the landlord and
the university first every single month — the same reason rent is out of the
headline. Grouped with `nameGroupKey`, matching `/stores`.

**What moved is one ranked list split by sign, not two sections.** There was a
separate "quiet wins" list; it was computed from the same baseline and named the
same categories a second time in a second phrasing, which is most of why neither
read clearly. The cap is **per direction**, so a month where everything rose
still shows what fell — which is the thing the separate list existed to
guarantee. Every row prints the two figures its change is the difference
between: "$59 under" names neither of them, and leaves the reader unable to tell
a monthly total from a per-visit amount. The "typical" figure is literally the
projection's per-month estimate for that category, so the sections reconcile on
sight. A category skipped entirely is kept rather than dropped for want of a
divisor — with no visits there is no average ticket, so the whole change is
frequency, which is both true and what makes the two effects still sum to the
delta.

**The email draws a column chart; the web draws the numeric grid.** Seven
columns of currency at a readable size do not fit 600px, and shrinking the type
to fit produced something that was never going to be read. A bar answers "is
this month high, and which way is it going" without parsing seven numbers, and
the two figures that matter — this month and a typical month — are still
written. Bars are **coloured table cells with pixel heights**: email clients
ignore percentage heights, and an image-based chart is invisible to anyone with
images off. Prior months use `baselineBar`, the neutral grey `layout.ts` already
defines for "the current period is the subject, the rest is the backdrop". The
full table stays on `/reports/monthly`, where it can scroll.

**The digest email is a step larger and much more widely spaced than the weekly
report** (15/14/13 against 14/13/12, 12px row padding against 6px, a rule
between every row). It carries roughly three times the content, its rows are two
lines deep, and it is read on a phone. **Explanatory text is a tinted callout
rather than merely smaller type** — at a size difference alone the long notes
read as data the reader was failing to parse. The callout sets colour *and*
background, per the Gmail dark-mode rule in `layout.ts`.

**The web view takes a month; the email cannot.** Month selection is the one
thing an email structurally can't offer, and the projection is worth consulting
mid-month rather than only when it lands.

### Email

`src/lib/email/` — `layout.ts` (shell, escaping, bar markup), `send.ts` (the
never-throwing Resend wrapper), and one file per template.

- **Every send carries a unique `X-Entity-Ref-ID`.** Without it Gmail groups
  reports into a single conversation — the subjects and structure are
  near-identical by design — and then hides whatever it decides is quoted from
  the previous message behind a "…" expander. Entire sections read as missing,
  and re-sending to check a change makes it worse each time. The id is random
  rather than derived from the period or month, because the case that must work
  is sending the *same* report twice.
- **Rules between rows are filled table cells, not CSS borders.** A `<td>`
  border is widely but not universally honoured and fails silently — the rows
  just run together. A cell with a background colour and an explicit `height`
  renders everywhere.
- **`EMAIL_COLORS.border` is for card edges; `EMAIL_COLORS.rule` is for rows.**
  The edge colour is tuned against the page tint and is very nearly invisible
  used as a rule on white, which is how the digest first shipped reading as one
  undifferentiated block.
- **Every explanatory callout is preceded by its own rule.** Margin alone left
  the last row of a table running straight into the paragraph describing it, so
  the description read as one more row. Closing the table off is what makes the
  note read as commentary rather than data.
- **Weight carries the hierarchy, not just size.** Row labels are 600, totals
  and values 700, hints 400 and italic — hints set weight explicitly because
  they nest inside bold labels and would otherwise inherit it. Sub-headings
  ("Spent more") are 16px bold rather than 13px uppercase: at small sizes,
  letter-spaced caps read as *less* prominent than the body text beneath them,
  which is the opposite of what a heading is for.
- **The digest has its own `section()` rather than `layout.ts`'s
  `sectionHtml`.** It needs a heavier section divider (a 2px rule between rows
  makes a 1px section boundary the faintest line on the page, inverting the
  hierarchy), more padding, and a larger heading. `layout.ts` stays what both
  templates genuinely share.

**Sending is never fatal and never throws.** The caller has already done the
thing the email is about.

Gmail is the target, mobile and desktop, and its mobile app strips `<head>`
styles for accounts it doesn't host. That one fact forces the rest:

- Every style inline on the element. No `<style>`, no classes.
- Tables with `role="presentation"` for layout, not flexbox or grid.
- **No media queries** — pointless where `<style>` is stripped. Fluid single
  column, `width="100%"` capped at `max-width:600px`, no breakpoint anywhere.
- No web fonts, no CDN, no remote images. Bars are colored table cells, because
  an image-based bar is invisible until images load.
- **`color` and `background-color` always set together** on anything carrying
  text. Gmail's dark-mode inversion flips one and leaves the other, producing
  white on white.
- Under ~102 KB or Gmail clips the message.
- Escape every interpolated string — category and store names are free text.

---

## 6. Traps

Things that look like bugs and get "fixed" into real ones.

- **A `23505` unique violation on a subscription charge is success, not
  failure.** It means the receipt is on the ledger and only the counter fell
  behind — the crash window between the insert and the counter advance. This one
  line is what makes the runner self-repairing without transactions.
- **`buildCategoryColorMap` assigns by alphabetical index over the set it is
  handed.** Always build it over *every* category in the ledger, never the
  subset being rendered, or the same category gets different colours on
  different surfaces. This is why `ReportCategoryTable` and `CategoryMixBar`
  take a `colorMap` prop instead of deriving one.
- **Update schemas must be built from a defaults-free base.** A
  `newReceiptSchema.partial()` would carry `discount: 0` into a PATCH that only
  touched `category`, silently zeroing a real discount on every unrelated edit.
- **Charges run before the report in the cron.** Charges write, the report reads,
  and a backfilled charge dated inside the window has to be on the ledger first.
- **`?apikey=` on the Supabase authorize URL looks removable and isn't** —
  without it the gateway answers "No API key found in request".
- **Keep the whole generated `src/types/database.ts`, including other apps'
  `public` tables.** The generator hardcodes
  `DefaultSchema = …[Extract<keyof Database, "public">]`, so deleting the
  `public` key collapses `Tables`/`TablesInsert`/… to `never` with no error.
- **Inline chart styling must use the `--color-*` variables**, not the raw HSL
  component variables in `globals.css` — the raw ones aren't valid CSS colours
  on their own.
- **Nothing interpolated into a `style="…"` attribute may contain a double
  quote.** `EMAIL_FONT` held `"Segoe UI"` for months. A double quote inside a
  double-quoted attribute *ends the attribute*, so every declaration after
  `font-family` — size, colour, weight, padding — was discarded by the parser in
  all three templates. It fails **silently and invisibly**: the mail sends, the
  HTML is well-formed enough to render, and the result is text that looks
  merely unstyled. It was found only because bold headings kept arriving
  regular and repeated edits to spacing appeared to do nothing — the edits were
  correct and were being thrown away. Use single quotes for font names; they
  are valid CSS and safe in a double-quoted attribute, which is the same reason
  `escapeHtml` leaves `'` alone.

---

## 7. Deliberately out of scope

Each of these was decided, not overlooked.

| Not built | Why, and what would change that |
| --- | --- |
| Soft deletes / audit log | `updated_at` is the compromise |
| Server-side pagination | Revisit when `/manage` feels sluggish on load, not at a row count |
| Optimistic UI updates | On a personal ledger, a wrong number that silently reverts is worse than a 200 ms wait |
| Store→category defaults table | Derived from history instead (§1) |
| Subscriptions under `DATA_SOURCE=sqlite` | Dev-only mode, no such table |
| Subscription price-change schedule | Build when a "your price rises on `<date>`" email needs recording in advance. Until then edit the price; past receipts keep the old amount because they are facts |
| Custom date ranges on `/reports` | An arbitrary range has no natural baseline windows, which is most of the feature. `/daily` and `/monthly` answer those questions |
| Scheduled yearly report emails | The on-demand button covers it. The monthly digest *is* scheduled — as a branch of the same daily cron, not a second slot |
| Seasonal (month-of-year) forecasting | Needs two of each calendar month before September can be compared to a September. Revisit once the ledger is two years deep |
| A balance or account concept, and therefore true runway | Net flow answers the same question without a schema change. Build it when "how long does this last" needs an actual number |
| Multi-currency, split subscriptions, pre-charge reminders | Never asked for |

---

## 8. Demo mode

A second Vercel project builds this same repo, same branch, with
`NEXT_PUBLIC_DEMO_MODE=true` and **no other environment variable**. That absence
is the security boundary; everything below is convenience on top of it. Code
cannot exfiltrate what the environment does not hold.

`src/lib/demo/flag.ts` is the only read of the var. Everything else imports
`IS_DEMO`.

**The seam is `request()` in `src/hooks/use-finance-data.ts`, and it could not
be anywhere else.** Pattern A (§2) puts the whole data layer on the server, so
`getDataSource()` never runs anywhere that can see a visitor's `localStorage`.
The browser's only route to data is `/api`, which makes that one function the
entire surface. `src/lib/demo/transport.ts` answers there with a real
`Response` — not a parsed body, and not a thrown `ApiError`, which would have to
be imported from the module that imports the transport.

- **There is deliberately no `demo` branch in `getDataSource()`.** It is the
  obvious move and it produces a demo that doesn't work: the source runs in a
  Vercel function, so every visitor would share one dataset, it would vanish on
  each cold start, and one visitor's Reset would reset everybody.
- **`DemoDataSource` implements `DataSource` anyway**, and lives beside its two
  siblings in `src/lib/data/`. It is the only one that runs in the browser. The
  interface is what keeps it honest: a method added to `DataSource` breaks the
  demo build rather than silently leaving a feature dead.
- **The transport mirrors status codes, not just data.** `linkedRows()` keys off
  a 409 and the editors render the blocking rows from its `linked` payload, so a
  demo returning 500 there would silently lose both delete guards.
- **Three things Postgres does in production are re-implemented in the store**,
  because each is a *behaviour* and not a detail: the `updated_at` trigger, the
  two foreign keys behind the delete guards, and
  `unique (subscription_id, date)`. Without the last one, pressing "Run due
  charges" twice double-charges in the demo and doesn't in production.
- **Seed depth is set by the app's own analytics windows**, not by taste — 13
  months, because `BIG_SPENDER.medianMonths` is 12 and `DIGEST_BASELINE_MONTHS`
  is 6 behind the newest complete month. A shallower seed renders a projection
  with nothing to trim.

**The one auth bypass is a single early return at the top of `updateSession()`,
and its position is load-bearing.** It must precede `createServerClient`, not
merely the authorization checks: the demo build has no Supabase credentials, so
`requireEnv("NEXT_PUBLIC_SUPABASE_URL")` would throw on every request. `/login`
and `/auth/*` redirect to `/` there, because `/login` is the app's one `async`
server page and `getSessionUser()` hits the same throw.

**`requireUser()` and `requireOwnerForApi()` are untouched, and must stay that
way.** A demo branch inside the owner gate would be a second exception in the
one place this app allows exactly one (§2), and the gate would no longer be
readable as unconditional. The demo doesn't need one: no route handler is ever
reached. The visible consequence is that `curl`ing `/api/*` on the deployed demo
returns 500 rather than 401 — the handler runs, reaches `requireEnv`, and
throws. Nothing is behind it.

**Email is stopped at `sendEmail()`**, the single choke point all three
templates funnel through, rather than at each route. The cron handler also
returns early: `vercel.json` is committed, so the demo project registers the
same schedule, and nothing scheduled belongs in a demo.

**Every entry point into demo code is an `await import(...)`.** A
build-time-false `IS_DEMO` branch removes the *call*, not the *import* — and
`DemoBoot` and `DemoBanner` mount on every page in both modes, so a static
import there would ship the seed generator and its fictional-world tables to
production visitors.

---

## 9. Scheduling

**Vercel Hobby allows one cron.** `vercel.json` holds it at `0 12 * * *`
(08:00 EDT / 07:00 EST) and it drives all three scheduled jobs: subscription
charges, the Saturday weekly report, and the monthly digest on the 3rd. Each is
a date check inside the one handler. Anything else needing a schedule folds into
it the same way.
