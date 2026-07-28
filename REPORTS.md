# REPORTS.md — spending reports (weekly email + on-demand week/month/year)

Design document for one feature with two triggers. Read `CLAUDE.md` first, then
`FEATURES.md` §0 (the governing principle) — everything here is downstream of it.

`migration.md` is the record of _why the app is shaped the way it is_.
`FEATURES.md` is the record of _stores, editing and subscriptions_. This file is
the record of _how spending is summarised and mailed_.

**Status: built and deployed (2026-07-28).** Every section here is implemented as
written, with one deviation noted inline in §4.1. Do not update this file to
reflect progress — amend it only when a decision here turns out to be wrong, and
say so inline. `PROGRESS.md` carries the running state.

---

## 0. The governing principle, restated for this feature

> **`receipts` is the ledger of facts. Everything else is either a generator
> that writes into it, or a lens that reads it.** (`FEATURES.md` §0)

A report is **a lens, and nothing else**. It writes no rows, owns no table, adds
no column, and stores no state — not even "when did I last send one".

That single sentence pre-decides most of the design:

- **No `reports` table, no `report_runs` table, no "last sent" timestamp.** A
  report is a pure function of `(rows, period, today)`. Two runs over the same
  ledger produce the same bytes.
- **No catch-up.** Subscriptions catch up because they write facts and a missed
  fact is lost (`FEATURES.md` §6.3). A missed report loses nothing — the numbers
  are still in the ledger and `/reports` re-derives them in one click. Adding
  catch-up would require persisted state, which would make a lens into a
  generator. See §6.4.
- **Editing history changes past reports, retroactively and silently.** Fix a
  mis-filed receipt from three weeks ago and last week's report, re-rendered,
  now reads differently from the copy in your inbox. This is correct — the email
  is a photograph, the ledger is the subject — and it is why every report states
  the exact window and the date it was generated for.
- **The excluded-category list (§2) is policy, not data.** It lives in
  `config.ts`. Changing it changes every future report and every re-render of a
  past one. Also correct, for the same reason.

The one risk worth naming: the temptation to make the weekly email "reliable" by
remembering what it already sent. Don't. §6.4 explains what to do instead.

---

## 1. Decisions already made

All confirmed in the design conversation.

| #    | Decision                                                                                                                       | Rationale                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| R1   | A report window is **the N days ending yesterday**. N = 7 / 30 / 365.                                                         | §2.1. One rule for all three periods; on a Saturday it _is_ last Sat→Fri, which is what was asked for.                        |
| R2   | Comparison baselines: **4 prior windows** for week and month, **1** for year.                                                 | Five years of history won't exist; a yearly report is year-over-year.                                                          |
| R3   | Spending is always **net** (`actual_price`). No gross/net toggle.                                                             | §2.3. "Refunds should subtract from money spent." A report answers what left the account.                                      |
| R4   | **Saved = discount savings** (`computeSavings`), reported alongside **Received = disbursements _not_ linked to a receipt**.   | §2.3. Linked disbursements already reduced Spent; counting them again would double-count the same dollar.                      |
| R5   | **Travel / School / Rent** are excluded from all comparison math and shown in a separate strip with an all-in total.          | §2.2. The headline number and the % change describe the same scope — habitual spending — which is the only way the % is honest. |
| R6   | Headline % change is **vs. the average of the baseline windows**, with a mini bar per window.                                 | Week-over-week alone is too noisy; the bars show whether the average is a fair baseline.                                       |
| R7   | **`/reports` renders the report in-browser**, with a separate "Send to email" button.                                        | §5. Also the only way to iterate on the layout without burning Resend quota.                                                   |
| R8   | The weekly email is **its own email, sent every Saturday**, including zero-spend weeks.                                       | §6.4. A silent Saturday then unambiguously means the cron is broken. Contrast the subscription email's send-only-on-change rule. |
| R9   | **The model is built server-side and fetched as JSON**, even though the page already has the rows cached.                     | §4.4. One definition of "today", one set of numbers behind both the preview and the email.                                     |
| R10  | The email is **hand-written inline-styled HTML**, not `react-email` or any template engine.                                   | §3.7. The existing `email.ts` already works this way, and a React email renderer still can't share components with the live page. |
| R11  | **No report state is persisted anywhere.**                                                                                    | §0.                                                                                                                            |

---

## 2. The model

### 2.1 Windows

One rule, three sizes:

```ts
export type ReportPeriod = "week" | "month" | "year";

export const REPORT_PERIODS = {
  week:  { days: 7,   baselines: 4, noun: "week",  label: "Week"  },
  month: { days: 30,  baselines: 4, noun: "month", label: "Month" },
  year:  { days: 365, baselines: 1, noun: "year",  label: "Year"  },
} as const;
```

**The current window ends yesterday and spans `days` days.** All arithmetic on
plain ISO strings through `addDaysISO`, per `CLAUDE.md`'s date rule:

```
end   = addDaysISO(today, -1)
start = addDaysISO(end, -(days - 1))
```

Baseline window _k_ (1 = most recent) is the `days`-day block immediately
preceding baseline _k−1_ (or the current window, for _k_ = 1). No gaps, no
overlap.

Run on Saturday **2026-08-01** with `period: "week"`:

```
current    2026-07-25 → 2026-07-31   (Sat → Fri)
baseline 1 2026-07-18 → 2026-07-24
baseline 2 2026-07-11 → 2026-07-17
baseline 3 2026-07-04 → 2026-07-10
baseline 4 2026-06-27 → 2026-07-03
```

Which is exactly the Sat→Fri week that was asked for — **not because Saturday is
special-cased, but because "the 7 days ending yesterday" run on a Saturday is
that week.** Keep it that way. The builder must never know what day of the week
it is; only the cron does (§6.3). That is what makes the same code serve an
on-demand Wednesday run.

Two consequences worth stating plainly:

- **"Month" is 30 days and "year" is 365 days, not calendar periods.** A trailing
  window was chosen over a calendar one so the report is always current; the cost
  is that labels are date ranges, not "July 2026". Equal-length windows are also
  what makes the comparison arithmetic honest — comparing a 31-day month to a
  28-day one needs a per-day normalisation that nobody reads correctly.
- **365 ignores leap years.** Both windows in a yearly comparison are 365 days,
  so they are still equal-length and still comparable; the only effect is that
  the "year ago" boundary drifts by a day per leap year. Not worth a fix.

**Baseline windows that predate the ledger are dropped, not counted as zero.**
If the earliest receipt in the whole ledger is later than a baseline window's
`start`, that window is _partial or empty for a reason that has nothing to do
with spending_, and averaging it in would drag the baseline down and report a
fictitious increase. Such a window renders as "no data" in the bar list and is
excluded from `baselineAvg`. If _every_ baseline is dropped, the comparison
section is replaced by a single line: _"Not enough history to compare yet."_

### 2.2 Habitual vs. excluded

```ts
// Policy, not data. Spending in these categories is real but not habitual —
// it's lumpy, it's decided once a year, and averaging it into a weekly
// comparison drowns out every signal the comparison exists to show. They are
// still reported, just outside the math.
export const COMPARISON_EXCLUDED_CATEGORIES = ["Travel", "School", "Rent"];
```

Lives in `src/lib/config.ts` alongside `APP_TIMEZONE`.

**Matching is normalised, because categories are free text.** Reuse
`nameGroupKey` from `src/lib/name-groups.ts` — the app's existing "these are the
same name" rule (trim / lowercase / collapse whitespace). Do **not** write a
second normaliser:

```ts
const EXCLUDED_KEYS = new Set(COMPARISON_EXCLUDED_CATEGORIES.map(nameGroupKey));
export const isExcludedCategory = (c: string) => EXCLUDED_KEYS.has(nameGroupKey(c));
```

`"Rent"`, `" rent"` and `"RENT"` all match. `"Rent — parking"` does not, and
shouldn't — that's a different category as far as every other page in the app is
concerned.

The split governs:

- **Headline Spent** — habitual only.
- **The % change and all baseline math** — habitual only, on both sides of the
  comparison. A baseline window is also summed habitual-only.
- **The category table** — habitual only.
- **The excluded strip** — the three categories, amounts only, no bars, no
  comparison, plus an all-in total. Categories with nothing in the window are
  omitted rather than printed as `$0.00`.

### 2.3 What the numbers mean

| Figure       | Definition                                                                                        | Scope             |
| ------------ | --------------------------------------------------------------------------------------------------- | ----------------- |
| **Spent**    | `sum(actual_price)` over receipts in the window                                                     | habitual          |
| **Saved**    | `sum(computeSavings(r))` over the same receipts                                                     | habitual          |
| **Received** | `sum(amount)` over disbursements in the window with `refunded_from_receipt == null`                 | n/a (no category) |
| **All-in**   | habitual Spent + excluded Spent                                                                     | everything        |

Three notes, each of which is a decision:

1. **Always `actual_price`, never `price`.** The app's net-paid toggle does not
   exist here. A refund is money that came back, so it subtracts from what was
   spent — which is also why refund-linked disbursements are deliberately absent
   from **Received**. Counting them in both places would report the same dollar
   twice, once as a reduction and once as income.
2. **Disbursements have no category**, so **Received** cannot be split
   habitual/excluded. It sits outside the split as its own figure, labelled so
   it can't be mistaken for a reduction of the headline.
3. **Saved is habitual-scope**, matching the headline. Excluded-category
   discounts (a cheap flight) are summed into the excluded strip instead, so no
   savings vanish — they're just reported next to the spending they came from.

### 2.4 The shape

`src/lib/reports.ts` — pure, no `server-only`, no I/O, importable from both the
client page and the server email path.

```ts
export interface ReportWindow { start: string; end: string } // inclusive, ISO

export interface ReportCategoryRow {
  category: string;
  spent: number;           // net
  receiptCount: number;
  shareOfHabitual: number; // 0..1, of this window's habitual spend
  /** Null when no usable baseline window covers this category. */
  baselineAvg: number | null;
  /** Fraction, e.g. 0.142. Null when baselineAvg is null or 0. */
  changeVsBaseline: number | null;
}

export interface ReportBaselineWindow {
  window: ReportWindow;
  /** Null = the window predates the ledger and is excluded from the average. */
  spent: number | null;
}

export interface SpendingReport {
  period: ReportPeriod;
  /** The "today" this was built against. Present so the email is self-describing. */
  generatedFor: string;
  window: ReportWindow;

  habitual: {
    spent: number;
    saved: number;
    receiptCount: number;
    categories: ReportCategoryRow[]; // desc by spent
  };
  excluded: {
    spent: number;
    saved: number;
    categories: { category: string; spent: number; receiptCount: number }[];
  };
  allInSpent: number;
  received: { total: number; count: number };

  comparison: {
    baselines: ReportBaselineWindow[]; // most recent first
    /** Mean of the non-null baselines. Null when none are usable. */
    baselineAvg: number | null;
    /** Fraction. Null when baselineAvg is null or 0 — never Infinity or NaN. */
    changeVsBaseline: number | null;
    usableBaselines: number;
    requestedBaselines: number;
  };
}

export function buildSpendingReport(
  receipts: MergedReceipt[],
  disbursements: Disbursement[],
  period: ReportPeriod,
  today: string,
): SpendingReport;
```

**The division-by-zero cases are part of the contract, not an edge case to
discover in production.** `changeVsBaseline` is `null` — never `Infinity`, never
`NaN` — whenever the baseline is zero or absent, and every renderer must print
something like _"no baseline"_ for it. A first-ever week compared against four
empty windows is the normal first run of this feature, not an exotic input.

**`shareOfHabitual` is 0 when habitual spend is 0**, and the whole category
table is then omitted rather than rendered with `NaN%` bars.

---

## 3. The email

### 3.1 Layout

Same structure in the email and on the page (§5). One column, top to bottom:

```
┌──────────────────────────────────────────────┐
│  💸 Finance Tracker                          │   ← header strip
│  Week of Jul 25 – Jul 31, 2026               │
├──────────────────────────────────────────────┤
│                                              │
│   HABITUAL SPEND                             │
│   $412.60                                    │   ← ~32px, the one big number
│   ▲ 14.2% vs 4-week avg ($361.20)            │
│                                              │
│   Saved on discounts     $38.15              │   ← two supporting stats
│   Received (unlinked)    $60.00              │
│                                              │
├──────────────────────────────────────────────┤
│  WHERE IT WENT                               │
│                                              │
│  Groceries          $184.20  ████████████    │
│                      45% · ▲ 9%              │
│  Eating Out (Soc.)   $96.40  ██████░░░░░░    │
│                      23% · ▼ 12%             │
│  Transportation      $71.00  ████░░░░░░░░    │
│                      17% · ▲ 40%             │
│  Health              $61.00  ████░░░░░░░░    │
│                      15% · — no baseline     │
│                                              │
├──────────────────────────────────────────────┤
│  VS. THE PREVIOUS 4 WEEKS                    │
│                                              │
│  Jun 27   ██████████████   $414.02           │
│  Jul 04   █████████░░░░░   $291.10           │
│  Jul 11   ███████████░░░   $352.44           │
│  Jul 18   ████████████░░   $387.24           │
│  THIS     █████████████░   $412.60           │   ← accent color
│                                              │
│  Each bar is a 7-day window starting on the  │
│  date shown. Average $361.20.                │
│                                              │
├──────────────────────────────────────────────┤
│  NOT COMPARED                                │
│  Rent                    $1,200.00           │
│  Travel                    $340.18           │
│                                              │
│  All-in total            $1,952.78           │
├──────────────────────────────────────────────┤
│  [ Open Finance Tracker ]                    │
│  Generated Sat 2026-08-01 for Jul 25–31.     │
└──────────────────────────────────────────────┘
```

Ordering rationale: the two numbers asked for first, then the breakdown, then
the comparison, then the excluded strip last — it's reference material, not a
finding, and putting $1,200 of rent above a $412 habitual total buries the lede.

### 3.2 Gmail compatibility — the rules that actually bind

Target is **Gmail, mobile app and desktop web**. These are constraints, not
preferences; each one is a thing that visibly breaks if ignored.

1. **Every style is inline on the element.** No `<style>` block, no classes.
   Gmail's mobile app strips `<head>` styles for non-Gmail-hosted accounts, and
   a layout that only survives on the web client is a layout that breaks in the
   place it's most often read. The existing `email.ts` already inlines; keep it.
2. **Tables for layout — `<table role="presentation" cellpadding="0"
   cellspacing="0" border="0">`.** Flexbox and grid are not reliable across
   Gmail's renderers. `role="presentation"` keeps screen readers from announcing
   layout tables as data tables; the _category_ table is a real table and keeps
   its `<th>` headers.
3. **No media queries.** They're pointless where `<style>` is stripped. Instead
   the layout is **fluid**: `width="100%"` with `style="max-width:600px"` on the
   outer table, single column throughout. It fills a 390px phone and caps at
   600px on desktop with no breakpoint anywhere. This is the constraint that
   forces one column — it is also, separately, the right layout for this
   content.
4. **No external anything.** No web fonts, no CDN, no background images, no
   remote images at all. System stack:
   `-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`.
   Bars are colored table cells (§3.3), not images — an image-based bar chart
   would be invisible until images are loaded, which for many recipients is
   never.
5. **Minimum font sizes: 14px body, 13px captions.** iOS Mail and Gmail Android
   auto-scale text below ~13px and will silently reflow the layout doing it.
6. **Dark mode: set `color` and `background-color` on the same element,
   everywhere text sits.** Gmail applies its own inversion to light emails, and
   the failure mode is always the same one — it inverts the text color but
   leaves an explicitly-set background (or vice versa), producing white-on-white.
   Setting both together is what survives. Use `#ffffff` cards on an `#f4f6f7`
   body rather than pure white on pure black at any point.
7. **Under 102 KB of HTML**, or Gmail clips the message and hides the tail
   behind a "[Message clipped]" link. The full layout above is ~8 KB; a yearly
   report with many categories is the only way to approach the limit, so the
   category table is capped at **25 rows** with the remainder rolled into a
   single "N other categories — $X" row. State the cap in the row itself.
8. **Escape every interpolated string.** Category names are free text; so are
   store names. Reuse the existing `escapeHtml`. Note it does not escape `'`,
   which is fine because nothing is ever interpolated into a single-quoted
   attribute — keep that true.
9. **A preheader.** A hidden span immediately after `<body>` carrying the
   summary line, so the inbox preview reads
   `$412.60 habitual · ▲14% vs 4-week average` instead of "💸 Finance Tracker".
10. **A plain-text alternative** built from the same model and passed as
    Resend's `text:`. It improves deliverability, and it is the version that
    renders when HTML is blocked.

### 3.3 The bars

A bar is a **two-cell nested table**, not a div with a percentage width. Percent
widths on divs inside table cells are the single least portable thing in email,
and the two-cell version costs nothing:

```html
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
       style="border-collapse:collapse;table-layout:fixed">
  <tr>
    <td width="45%" height="10"
        style="background-color:#00D1B0;font-size:0;line-height:0;border-radius:2px 0 0 2px">&nbsp;</td>
    <td width="55%" height="10"
        style="background-color:#e6eaec;font-size:0;line-height:0;border-radius:0 2px 2px 0">&nbsp;</td>
  </tr>
</table>
```

- `font-size:0;line-height:0` plus `&nbsp;` is what keeps the cell from
  collapsing to zero height in clients that ignore `height`.
- Widths are **integer percentages** that sum to exactly 100 — compute the fill,
  then derive the track as `100 - fill`. Never round both independently.
- **Floor the fill at 1%** so a real-but-tiny category still shows a sliver
  rather than reading as zero.
- **Scale to the largest row, not to the total.** The top category is always a
  full bar and the shape below it is readable. Scaling to the total would leave
  every bar under a third of the track on a well-spread week, which is the
  version that looks broken.

**Colors come from `buildCategoryColorMap` in `src/lib/colors.ts`** — the same
single source `CLAUDE.md` requires, in `"light"` mode (the email has a light
background by construction).

> ⚠️ **Build the map over every category in the whole ledger, not just the ones
> in the report window.** `buildCategoryColorMap` assigns from the palette by
> alphabetical index _over the set it is given_, so a set of 4 window categories
> produces different colors than the app's pages, which pass every category in
> the full receipt list (`monthly/page.tsx:75`, `stores/page.tsx:154`). Passing
> the window's categories would make Groceries turquoise in the email and blue
> in the app — a silent violation of the same-category-same-color rule that
> nothing would catch. This is the one non-obvious trap in the whole feature.

The comparison bars are not per-category and use a single accent:
`--color-primary`'s hex equivalent for the current window, a muted grey for the
baselines, so the current week reads as the subject.

### 3.4 Direction and color

`▲` for more spending, `▼` for less. Increase renders in a muted red, decrease in
a muted green — but **the glyph and the number always carry the meaning on their
own**. Nobody should have to see color to read the direction, which matters both
for CVD and because Gmail's dark-mode inversion can shift a color enough to
change its apparent hue.

`—` and the words _"no baseline"_ where `changeVsBaseline` is null. Never a
`0%`, never a blank cell — both read as "unchanged", which is a different claim.

### 3.5 Subject lines

| Case                         | Subject                                              |
| ---------------------------- | ---------------------------------------------------- |
| Weekly, spending up          | `📈 Week of Jul 25 — $412.60 habitual, up 14%`      |
| Weekly, spending down        | `📉 Week of Jul 25 — $412.60 habitual, down 8%`     |
| Weekly, no usable baseline   | `📊 Week of Jul 25 — $412.60 habitual`              |
| Zero habitual spend          | `📊 Week of Jul 25 — no habitual spending`          |
| Month / year                 | Same shapes with `Month ending Jul 27` / `Year ending Jul 27` |

The amount and direction go in the subject deliberately: most weeks, reading the
subject is the entire interaction, and an email you don't have to open is a
feature. Note the subject line never mentions excluded categories — it describes
the same scope as the headline.

### 3.6 Sending

Recipient/sender config, minimising new env vars:

- **From:** `SUBSCRIPTION_EMAIL_FROM` (existing).
- **To:** `REPORT_EMAIL_TO` if set, else `SUBSCRIPTION_EMAIL_TO` (existing).

So nothing new has to be configured in Vercel for this to work, and the one
plausible divergence — routing reports somewhere else — is available without a
code change. Missing config behaves exactly as the subscription email does
today: log a warning, skip the send, don't fail.

**Send failure is never fatal, and never affects anything else.** Same rule as
`FEATURES.md` §6.8, and here it's cheaper still, because a report has nothing to
roll back.

### 3.7 Why not `react-email`

It would let the email be authored as components, which is genuinely nicer than
string concatenation. It does not let those components be _the same components_
as the live `/reports` page, because the page needs Tailwind classes and real
DOM and the email needs inlined attributes and layout tables. So the choice is
between one JSX tree plus one string builder, or two JSX trees plus a
dependency. The model (§2.4) is the shared thing; the two renderers are
genuinely different targets. The existing `email.ts` already proves the string
approach is maintainable at this size.

**This is the decision to revisit** if the email grows a second or third layout.
Until then, one dependency avoided.

---

## 4. Server pieces

### 4.1 `src/lib/email/` — split the existing file

`src/lib/email.ts` becomes a directory. The subscription templates move
**verbatim**; this is a move, not a rewrite.

```
src/lib/email/index.ts             re-exports, so the two existing importers don't change
src/lib/email/layout.ts            escapeHtml, emailShell(), stat/table/bar builders, style tokens
src/lib/email/send.ts              the never-throwing Resend wrapper, extracted from email.ts
src/lib/email/subscription-run.ts  the existing content, moved unchanged
src/lib/email/spending-report.ts   new — buildReportHtml / buildReportText / reportSubject
```

`src/lib/email.ts` is **deleted** — a file and a directory of the same name
can't coexist, and the `index.ts` re-export is what keeps
`import { sendSubscriptionRunEmail } from "@/lib/email"` working in both route
handlers with zero edits.

> **Amendment (2026-07-28), two corrections to this section as built.**
>
> 1. **"Verbatim" turned out to be the wrong instruction.** The subscription
>    content and wording did move unchanged, but it now renders *inside*
>    `emailShell` rather than shipping as a bare fragment, which is what this
>    section says `layout.ts` exists for in the first place — "so the two
>    templates can't drift apart on the parts that are pure boilerplate". A
>    fragment has no chrome to share. The side effect is that the subscription
>    email picked up the same mobile and dark-mode safety the report has, which
>    it did not have before.
> 2. **A file and a directory of the same name *can* coexist** — the reasoning
>    above is wrong even though the outcome was right. Both TypeScript and
>    webpack try `email.ts` before `email/index.ts`, so the file would have won
>    and resolution would have stayed deterministic. `src/lib/email.ts` is
>    nonetheless gone, which is the cleaner end state: `@/lib/email` now
>    resolves to the directory, and there is one barrel rather than two.

`layout.ts` owns the chrome (§3.2's shell, the preheader, the footer) so the two
templates can't drift apart on the parts that are pure boilerplate. `send.ts`
owns the "resolve config → send → swallow and log" wrapper both use.

### 4.2 `src/lib/reports-runner.ts` — `server-only`

Mirrors `subscriptions-runner.ts`. One function every entry point goes through:

```ts
export async function buildReportForPeriod(
  period: ReportPeriod,
  options: { today?: string } = {},
): Promise<SpendingReport>;

export async function sendSpendingReport(
  period: ReportPeriod,
  options: { today?: string } = {},
): Promise<{ sent: boolean; subject: string | null; reason?: string }>;
```

`buildReportForPeriod` loads via `getDataSource()` — `loadMergedReceipts()` and
`loadDisbursements()` — and hands off to the pure `buildSpendingReport`. **All
I/O is here; none is in `reports.ts`.** That separation is what makes the model
testable by hand against literal arrays.

`today` defaults to `todayInZone(APP_TIMEZONE)`, same as the subscription runner
and for the same reason: on Vercel the server's local zone is UTC, and a report
generated at 08:00 ET must not think it's already tomorrow.

### 4.3 Routes

| Method | Path                        | Auth                   | Notes                                          |
| ------ | --------------------------- | ---------------------- | ---------------------------------------------- |
| `GET`  | `/api/reports?period=week`  | `requireOwnerForApi()` | Returns `SpendingReport` JSON. Read-only.      |
| `POST` | `/api/reports/send`         | `requireOwnerForApi()` | Body `{ period }`. Rebuilds, sends, returns the summary. |

Both start with `const denied = await requireOwnerForApi(); if (denied) return denied;`
as their literal first statement, per `CLAUDE.md`'s hard rule. **No new gate is
introduced by this feature** — §6.3 folds the scheduled path into the existing
cron handler, so the app still has exactly two gates and one exception.

`period` is validated with a zod enum on both routes and 400s on anything else;
it reaches a `Record` lookup, so an unvalidated value would be a silent
`undefined` rather than an error.

> **`POST /api/reports/send` takes only `{ period }` — never a report body.**
> It rebuilds the model server-side. Two reasons, and the second is the real
> one: a client-supplied payload means the numbers in an email you will act on
> came from somewhere other than the database, and there is no way to tell from
> the email that they did.

### 4.4 Why the page fetches the model instead of building it

The `/reports` page already has every receipt and disbursement in the TanStack
Query cache — `/stores` and `/manage` both aggregate client-side for exactly
that reason, and doing the same here would cost zero requests.

It still fetches, because of **"today"**. `APP_TIMEZONE` is a server variable
(deliberately not `NEXT_PUBLIC_`), so the browser would have to fall back to
`todayISO()` — the browser's own zone. Those agree for a user sitting in
Toronto and disagree for a user who isn't, or who is travelling, and the
disagreement is a one-day shift in every window boundary. The preview would then
show a different week than the email sends, occasionally, with nothing on screen
explaining why.

Fetching the model makes the server the only thing that decides what "today"
means, and makes the preview provably the same object the email renders. The
cost is one small JSON request per period switch. Cache it under a
`["report", period]` query key with the same `staleTime` as the rest.

---

## 5. `/reports` — the page

**Route:** `/reports`. **Nav:** inline, after Disbursements. It's analysis, not
data management, so it does not belong in the "Manage ▾" popover
(`FEATURES.md` §7.1). That takes the inline row to 7 — watch the desktop
overflow the popover was introduced to solve; the row already scrolls
horizontally, so this is a thing to look at, not a thing to pre-solve.

**No `FilterBar`.** Same reasoning as `/stores` and `/manage`, arrived at
differently: a report's window is defined by its period, and a date filter on top
of it would produce a "week" that isn't seven days.

Layout:

- **Period tabs** — Week / Month / Year (existing `Tabs` primitive). Switching
  refetches; the previous report stays visible while loading rather than
  flashing to a skeleton.
- **The report itself**, rendered with app components: `StatCard` for the three
  figures, a real `Table` for the categories, a new
  `src/components/report/proportion-bar.tsx` for the bar cell. That's a
  single-value bar and is genuinely not `CategoryMixBar` (which is a stacked
  segment bar over counts) — it takes the color from `useCategoryColors`, same
  rule.
- **A banner above it:** _"This is exactly what gets emailed."_ It is the point
  of the preview, and it stops being true the moment someone changes one
  renderer and not the other.
- **"Send to email"** — one click, no confirm (it's an email to yourself), with
  the recipient shown next to the button so it's never a mystery where it went.
  Toast on success; toast the failure reason on 500, since here — unlike the
  cron — there is someone watching.
- **Empty state:** a window with no receipts at all renders the shell with
  `$0.00` and _"No receipts between Jul 25 and Jul 31."_ Not an error.

Components:

```
src/components/report/spending-report-view.tsx   the whole thing, given a SpendingReport
src/components/report/report-stat-row.tsx        the three headline figures
src/components/report/report-category-table.tsx  category · spent · Δ · bar
src/components/report/report-comparison.tsx      the baseline bars
src/components/report/proportion-bar.tsx         one-value bar, colored by category
```

`spending-report-view.tsx` takes a `SpendingReport` and nothing else — no
hooks, no fetching — so the same component renders a live report, a stale one,
or a hand-built fixture.

---

## 6. The Saturday email

### 6.1 It has to live in the subscriptions cron

`FEATURES.md` §6.6 called this exactly:

> One Hobby consequence that _does_ bind: with a single cron slot, this endpoint
> is it. Anything else that ever needs scheduling has to be folded into this same
> handler rather than getting its own entry.

So `vercel.json` is unchanged, `GET /api/cron/subscriptions` grows a second
responsibility, and no new `PUBLIC_PATHS` entry is added. That last point is
worth being explicit about: the deny-by-default proxy would 401 a new
`/api/cron/*` route before its handler ran, and the failure would be silent.
Reusing the existing handler sidesteps that entirely.

The handler's docblock must be updated to say it does two things — a name that
undersells what a route does is how the second thing gets deleted by someone
tidying up.

### 6.2 Ordering inside the handler

```ts
export async function GET(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  // 1. Charges first — they WRITE, and the report READS. A backfilled charge
  //    dated inside the report window has to be on the ledger before the
  //    report counts it.
  const run = await runDueSubscriptionCharges();
  await sendSubscriptionRunEmail(run);

  // 2. Then the weekly report, if today is Saturday. Wrapped so that a report
  //    failure can never change the status this route returns — the charges
  //    are the thing that must not be re-run by a retry.
  const weeklyReport = await maybeSendWeeklyReport();

  return NextResponse.json({ ...run, weeklyReport });
}
```

`maybeSendWeeklyReport()` returns `{ sent, reason? }` and never throws, so the
run JSON in the Vercel function logs says what happened either way — including
`{ sent: false, reason: "not-saturday" }`, which is how you confirm the check is
running at all.

### 6.3 The Saturday check

```ts
/** Day of week for an ISO date, 0 = Sunday … 6 = Saturday. UTC-anchored. */
export function dayOfWeekUTC(dateISO: string): number {
  return new Date(`${dateISO}T00:00:00Z`).getUTCDay();
}
```

Goes in `src/lib/dates.ts` next to `isoWeekStart`, which already does exactly
this internally. The cron calls
`dayOfWeekUTC(todayInZone(APP_TIMEZONE)) === 6`.

**Only the cron knows about Saturday.** `buildSpendingReport` takes a period and
a date and has no opinion about the calendar. This is what lets the identical
code path serve the on-demand button, and it means the weekly email can be
tested on a Tuesday by calling `sendSpendingReport("week")` directly.

Note the interaction with `APP_TIMEZONE`: the cron fires at 12:00 UTC, which is
08:00 EDT / 07:00 EST — the same date in both zones, so DST cannot move the
report onto the wrong day. That would stop being true for a cron scheduled near
midnight UTC; if the schedule ever moves, re-check this.

### 6.4 Always send, never catch up

**Send every Saturday, including a week with no spending at all.** A report that
only arrives when something happened can't be distinguished from a broken cron,
and unlike the subscription email — where a missing message means a missing
_fact_ you'd notice elsewhere — nothing else in the app would ever tell you the
weekly report stopped. A zero-spend week says so in one line and takes two
seconds to dismiss.

**No catch-up, and no state to enable one.** If Saturday's invocation fails, the
report is missed; Sunday's run does not send it. The alternative requires
remembering when the last one went out, which means a table, which makes a lens
into a generator (§0). The recovery is `/reports` → Week → Send, which produces
_the same seven days_ if done before the following Saturday — because the window
is trailing, not anchored. Run it on Sunday and you get Sun→Sat instead; the
email states its window, so this is visible rather than confusing.

This is a deliberate asymmetry with `FEATURES.md` §6.3's catch-up design, and the
reason is the whole of §0: subscriptions write facts, reports read them.

---

## 7. Environment and config

| Var                | New? | Notes                                                                       |
| ------------------ | ---- | --------------------------------------------------------------------------- |
| `REPORT_EMAIL_TO`  | yes  | Optional. Falls back to `SUBSCRIPTION_EMAIL_TO`. Server-only.               |
| `SUBSCRIPTION_EMAIL_FROM` | no | Reused as the sender for both email types.                             |
| `SUBSCRIPTION_EMAIL_TO`   | no | Default recipient for reports too.                                     |
| `RESEND_API_KEY`   | no   | Reused.                                                                     |
| `APP_TIMEZONE`     | no   | Reused — decides "today" for both the window and the Saturday check.        |
| `CRON_SECRET`      | no   | Unchanged. No new gate (§6.1).                                              |

Only one new variable, and it's optional. Add it to `.env.example` with the
fallback documented in the comment.

New constants in `src/lib/config.ts`: `REPORT_PERIODS` (§2.1) and
`COMPARISON_EXCLUDED_CATEGORIES` (§2.2).

---

## 8. Files touched

```
src/lib/reports.ts                             [new]  pure model — no I/O
src/lib/reports-runner.ts                      [new]  server-only, loads + sends
src/lib/dates.ts                               [+]    dayOfWeekUTC
src/lib/config.ts                              [+]    REPORT_PERIODS, COMPARISON_EXCLUDED_CATEGORIES

src/lib/email.ts                               [DELETED — becomes the directory below]
src/lib/email/index.ts                         [new]  re-exports; keeps existing imports working
src/lib/email/layout.ts                        [new]  shell, preheader, escapeHtml, bar/table builders
src/lib/email/send.ts                          [new]  never-throwing Resend wrapper
src/lib/email/subscription-run.ts              [moved] content unchanged
src/lib/email/spending-report.ts               [new]  html + text + subject

src/app/api/reports/route.ts                   [new]  GET
src/app/api/reports/send/route.ts              [new]  POST
src/app/api/cron/subscriptions/route.ts        [+]    Saturday report, docblock

src/app/reports/page.tsx                       [new]
src/components/report/spending-report-view.tsx [new]
src/components/report/report-stat-row.tsx      [new]
src/components/report/report-category-table.tsx[new]
src/components/report/report-comparison.tsx    [new]
src/components/report/proportion-bar.tsx       [new]
src/hooks/use-finance-data.ts                  [+]    useSpendingReport, useSendSpendingReport
src/components/nav.tsx                         [+]    Reports

.env.example, CLAUDE.md, PROGRESS.md
```

**No migration. No schema change. No new table or column.** If this list grows
one, something has drifted from §0.

---

## 9. Build order

Each step is independently verifiable, and the first two need no UI at all.

1. **`src/lib/reports.ts` + the config constants.** Pure functions. Verify by
   reading: pick a Saturday, check the five windows, check that an excluded
   category never appears in `habitual.categories`.
2. **`src/lib/reports-runner.ts` + `GET /api/reports`.** Hit it in the browser
   while signed in and read the JSON. This is the whole model, visible, before a
   single pixel is styled.
3. **The `src/lib/email/` split.** Move-only. Nothing should change behaviourally;
   the two existing route imports must still resolve.
4. **`spending-report.ts` + `POST /api/reports/send`.** Send one to yourself and
   open it in Gmail on both a phone and a desktop, in light and dark mode.
   Iterate here — this is where the fiddly work is.
5. **`/reports` page + nav.** The renderer, against the endpoint from step 2.
6. **The cron hookup.** Two lines plus `maybeSendWeeklyReport`, last because it's
   the only part that can't be fully exercised before deploy.

---

## 10. Verification — what you have to run

Claude can't run builds, so all of this is yours.

- [ ] `pnpm typecheck`, `pnpm lint`.
- [ ] `GET /api/reports?period=week` in the browser — read the JSON, sanity-check
      the window dates against a calendar.
- [ ] `?period=month` and `?period=year`. **The year one is the interesting
      case**: with under two years of data, `comparison.baselines[0].spent`
      should be `null` and the section should say "not enough history" rather
      than reporting a huge increase against a partial year.
- [ ] `?period=nonsense` → 400, not a 500 and not a report full of `undefined`.
- [ ] Sign out, hit both routes → 401/403. The `requireOwnerForApi()` line is
      the only thing between them and any other signed-in user on the shared
      Supabase project.
- [ ] Send one to yourself. Check in Gmail: **iOS/Android app**, **desktop web**,
      **dark mode on both**. Specifically look for white-on-white text (§3.2 rule
      6) and a "[Message clipped]" link at the bottom (rule 7).
- [ ] Confirm the bars line up — the top category's bar should be full width.
- [ ] Confirm a category's color in the email matches the same category on
      `/monthly`. If it doesn't, it's the trap in §3.3.
- [ ] Compare the `/reports` preview against the email side by side.
- [ ] A week with zero spending — temporarily request a period far in the past
      via the API, or just wait for a quiet week. Should render, not error.
- [ ] **The last one open.** The app is deployed, so the cron is live; read one
      firing's `weeklyReport` in the Vercel function logs. On a non-Saturday it
      logs `{ sent: false, subject: null, reason: "not-saturday" }` — that's how
      you know the check runs at all. Then confirm the first Saturday send.

---

## Appendix A — deferred

- **Per-store breakdown.** The same table shape over `store` instead of
  `category` would answer "where is it going" more concretely, and the model
  could carry both. Deferred because the ask was categories and a second table
  doubles the email's length. The builder should not be shaped in a way that
  makes this hard to add.
- **A configurable excluded-category list in the UI.** It's three strings in
  `config.ts` today. The trigger to build UI is wanting a fourth for a reason
  that isn't obvious a year later.
- **Custom date ranges on `/reports`.** Deliberately not built: an arbitrary
  range has no natural baseline windows, which is most of what this feature is.
  `/daily` and `/monthly` already answer arbitrary-range questions.
- **Scheduled monthly/yearly emails.** Hobby has one cron slot and it's spoken
  for. Monthly could be folded into the same handler (`day-of-month === 1`) if
  wanted; it isn't, because the on-demand button covers it and an unasked-for
  monthly email is one more thing to start ignoring.

## Appendix B — explicitly out of scope

- **Any persisted report state**, including "last sent" (§0, §6.4).
- **Catch-up for a missed Saturday** (§6.4).
- **A gross/net toggle in reports.** Always net (R3).
- **Netting Received against Spent into a single "out of pocket" figure.** They
  answer different questions and the app has never combined them; combining them
  here would make the headline incomparable to every other total in the app.
- **`react-email` or any template engine** (R10, §3.7).
- **Charts in the email beyond the bars.** No images, no SVG — see §3.2 rule 4.
- **Outlook compatibility.** Gmail is the target. The table-based layout happens
  to survive Outlook reasonably well; it isn't tested there and isn't a
  requirement.
