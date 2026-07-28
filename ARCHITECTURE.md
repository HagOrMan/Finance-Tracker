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

---

## 4. Conventions

- **Dates are plain `"YYYY-MM-DD"` strings**, compared lexicographically or via
  `src/lib/dates.ts`'s explicit-UTC helpers. `new Date("YYYY-MM-DD")` parses as
  UTC midnight and displays as the previous day west of Greenwich.
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
  survive navigation. Default range is the last 30 days.
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

### Email

`src/lib/email/` — `layout.ts` (shell, escaping, bar markup), `send.ts` (the
never-throwing Resend wrapper), and one file per template.

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
| Scheduled monthly/yearly report emails | Hobby has one cron slot, and the on-demand button covers it |
| Multi-currency, split subscriptions, pre-charge reminders | Never asked for |

**Vercel Hobby allows one cron.** `vercel.json` holds it at `0 12 * * *`
(08:00 EDT / 07:00 EST) and it drives both subscription charges and the Saturday
report. Anything else needing a schedule folds into that same handler.
