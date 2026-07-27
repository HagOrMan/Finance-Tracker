# FEATURES.md — Store hygiene, receipt editing, and subscriptions

Design document for three related features. Read `CLAUDE.md` first, then this.
`migration.md` remains the record of _why the app is shaped the way it is_; this
file is the record of _what is being added next and why it is shaped that way_.

**Status:** approved, not yet implemented. Update `PROGRESS.md` as phases land;
do not update this file to reflect progress — amend it only when a decision here
turns out to be wrong, and say so inline.

---

## 0. The governing principle

> **`receipts` is the ledger of facts. Everything else is either a generator
> that writes into it, or a lens that reads it.**

Every consequence in this document follows from that sentence:

- A **subscription** is a _schedule_, not a spend record. It generates receipts.
  Nothing in the app's math ever reads a subscription. This is why adding
  subscriptions requires **zero changes to any existing chart, filter, total, or
  page** — the new spending simply appears as receipts, which everything already
  understands.
- A **store's category** is not a stored fact anywhere; it is an _observation_
  over the receipts. The Stores page is a lens. "Fixing" a store means rewriting
  receipts, not recording a mapping.
- **Price history needs no table.** Every past charge is already a receipt
  carrying the amount actually paid, and past receipts are immutable facts. A
  subscription only ever needs to know its _current_ price.

The single largest risk in this work is drifting away from that principle —
usually by adding a second place that knows what something costs. Don't.

---

## 1. What the app can't do today

[`src/lib/data/types.ts`](src/lib/data/types.ts)'s `DataSource` interface is
append-only: `loadReceipts`, `loadDisbursements`, `loadMergedReceipts`,
`insertReceipt`, `insertDisbursement`. There is no UPDATE and no DELETE anywhere
in the codebase.

All three features need mutation, so they share a **Phase 0**. Build it once.

### 1a. A discrepancy to fix first

[`supabase/migrations/finance_tracker_schema.sql:142-145`](supabase/migrations/finance_tracker_schema.sql#L142-L145)
claims:

> Only select and insert: the app issues no UPDATE and no DELETE anywhere […] so
> even a leaked secret key cannot rewrite or destroy history through PostgREST.

But [line 192](supabase/migrations/finance_tracker_schema.sql#L192) is a live,
uncommented `grant update, delete on … to service_role`. The file **as run**
already grants them. The comment is stale and must be corrected as part of Phase
0 — a security note that is quietly false is worse than no note.

The new true statement: the secret key can rewrite and delete history, so its
blast radius is now full read/write, and `OWNER_USER_IDS` plus `CRON_SECRET` are
the only things standing in front of it.

---

## 2. Decisions already made

| #   | Decision                                                                                                                                                      | Rationale                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Subscriptions generate receipts; nothing reads subscriptions for math                                                                                         | §0                                                                                                                                                                                   |
| D2  | The cron **catches up** everything due, it does not ask "is today the day"                                                                                    | §6.3                                                                                                                                                                                 |
| D3  | Catch-up loop is **TypeScript** in `src/lib/subscriptions.ts`; the DB unique index is the idempotency guard                                                   | Keeps `DataSource` intact, testable pure functions, no SQL to debug                                                                                                                  |
| D4  | **No price-history table.** Current price on the subscription; receipts _are_ the history                                                                     | §0. Pre-announced future price changes deferred → Appendix A                                                                                                                         |
| D5  | Receipt delete is a **hard delete**, blocked (409) when disbursements reference it                                                                            | Cascade would silently destroy refund records; soft delete costs a filter in every read path forever                                                                                 |
| D6  | Store grouping is **two-tier**: whitespace/case grouping is automatic; anything fuzzier only ever _suggests_                                                  | §5.2 — auto-merging "Sobeys"/"So Beys" would be a silent data change                                                                                                                 |
| D7  | Bulk edits are **id-list based**, not filter-based                                                                                                            | One endpoint covers recategorize, rename, and merge; the client already holds every receipt                                                                                          |
| D8  | Subscriptions are **Supabase-only**; `DATA_SOURCE=sqlite` throws on subscription methods                                                                      | sqlite mode is dev-only and its DB has no such table                                                                                                                                 |
| D9  | **No "Subscriptions" category.** Each subscription keeps its own real category (one is Professional Development, etc.); `subscription_id` is what groups them | §6.0 — the category answers _what kind of spending is this_, which is what every existing chart slices by. A catch-all category would collapse that distinction and re-file history. |
| D10 | `APP_TIMEZONE` = `America/Toronto`; Vercel **Hobby**                                                                                                          | Confirmed. See §6.5, §6.6.                                                                                                                                                           |
| D11 | **Disbursement entities get the same hygiene treatment as stores**, reusing one grouping implementation over a second field rather than a parallel one         | Added after the original design — §4.7. `entity` has exactly the free-text-drift problem `store` has, and merging is the same operation on a different column.                        |

---

## 3. Phase 0 — the write path

Everything below depends on this. Nothing user-visible ships in this phase.

### 3.1 Migration: `supabase/migrations/002_mutable_rows.sql`

```sql
-- ============================================================================
-- 002_mutable_rows.sql — makes receipts and disbursements editable.
-- Safe to re-run. Run AFTER finance_tracker_schema.sql.
-- ============================================================================

-- updated_at: un-backfillable later, so add it before the first edit happens.
alter table finance_tracker.receipts
    add column if not exists updated_at timestamptz not null default now();
alter table finance_tracker.disbursements
    add column if not exists updated_at timestamptz not null default now();

create or replace function finance_tracker.set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end $$;

drop trigger if exists receipts_set_updated_at on finance_tracker.receipts;
create trigger receipts_set_updated_at
    before update on finance_tracker.receipts
    for each row execute function finance_tracker.set_updated_at();

drop trigger if exists disbursements_set_updated_at on finance_tracker.disbursements;
create trigger disbursements_set_updated_at
    before update on finance_tracker.disbursements
    for each row execute function finance_tracker.set_updated_at();

-- Idempotent restatement of the grants the app now genuinely needs. These were
-- already present at the bottom of finance_tracker_schema.sql; repeating them
-- here makes this file self-contained and the intent explicit.
grant update, delete on
    finance_tracker.receipts,
    finance_tracker.disbursements
    to service_role;

-- Bulk recategorize / rename scans by store; the existing indexes are date-only.
create index if not exists receipts_store_idx on finance_tracker.receipts (store);
```

Also edit `finance_tracker_schema.sql`'s section-4 comment per §1a. **Do not**
delete the `grant update, delete` at its bottom — promote it out of the
"if you later build edit/delete UI" framing into a plain statement of fact.

After running: re-run the type generator and take the output verbatim —

```
npx supabase gen types typescript --project-id <ref> --schema public --schema finance_tracker
```

(Keep the whole file including the other apps' `public` tables — see
`PROGRESS.md`'s note on why deleting the `public` key collapses everything to
`never`.)

### 3.2 Types — `src/lib/data/types.ts`

```ts
export interface Receipt {
  id: number;
  store: string;
  category: string;
  price: number;
  discount: number;
  discount_percentage: number;
  note: string | null;
  date: string;
  /** Null for hand-entered receipts; set for cron-generated subscription charges. Phase 3. */
  subscription_id: number | null;
  /** Display-only ("last edited"). Never sent on a write. */
  updated_at: string;
}

export type UpdateReceiptInput = Partial<
  Pick<
    Receipt,
    | "store"
    | "category"
    | "price"
    | "discount"
    | "discount_percentage"
    | "note"
    | "date"
  >
>;

export type UpdateDisbursementInput = Partial<
  Pick<
    Disbursement,
    "entity" | "amount" | "date_received" | "reason" | "refunded_from_receipt"
  >
>;
```

`DataSource` gains:

```ts
updateReceipt(id: number, patch: UpdateReceiptInput): Promise<Receipt>;
updateReceipts(ids: number[], patch: UpdateReceiptInput): Promise<Receipt[]>;
deleteReceipt(id: number): Promise<void>;
/** For the delete guard — the disbursements that would block a delete. */
disbursementsForReceipt(id: number): Promise<Disbursement[]>;

updateDisbursement(id: number, patch: UpdateDisbursementInput): Promise<Disbursement>;
deleteDisbursement(id: number): Promise<void>;
```

`subscription_id` is added to the type in Phase 0 (nullable, always `null`) so
Phase 3 doesn't have to touch every select list again. `SqliteDataSource` uses
`SELECT *` and its dev DB has no such column, so it must coalesce:
`subscription_id: r.subscription_id ?? null`, `updated_at: r.updated_at ?? ""`.

### 3.3 Zod — `src/lib/data/schemas.ts`

⚠️ **The trap to avoid.** `newReceiptSchema` has `.default(0)` on `discount` and
`discount_percentage`. Writing `newReceiptSchema.partial()` for the update schema
means a PATCH that omits `discount` gets `discount: 0` filled in by the default —
**silently zeroing a real discount on every unrelated edit.** Restructure so the
update schema is built from a defaults-free base:

```ts
const receiptFields = {
  store: z.string().trim().min(1, "Store is required"),
  category: z.string().trim().min(1, "Category is required"),
  price: z.coerce.number().positive("Price must be greater than 0"),
  discount: z.coerce.number().min(0),
  discount_percentage: z.coerce.number().min(0).max(100),
  note: z.string().trim().nullable().optional(),
  date: isoDate,
} as const;

export const newReceiptSchema = z.object({
  ...receiptFields,
  discount: receiptFields.discount.default(0),
  discount_percentage: receiptFields.discount_percentage.default(0),
});

export const updateReceiptSchema = z
  .object(receiptFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, "No fields to update");

export const bulkUpdateReceiptsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(1000),
  patch: updateReceiptSchema,
});
```

Mirror the same restructure for disbursements.

**Never spread the raw request body into an update.** zod strips unknown keys, so
building the patch _only_ from `parsed.data` is what keeps `id`, `created_at`,
`updated_at`, and `subscription_id` unpatchable. This is load-bearing.

### 3.4 Routes

New files, each starting with `const denied = await requireOwnerForApi(); if (denied) return denied;`
— no exceptions, per `CLAUDE.md`'s hard rule.

| Method   | Path                       | Body                            | Notes                                           |
| -------- | -------------------------- | ------------------------------- | ----------------------------------------------- |
| `PATCH`  | `/api/receipts/[id]`       | `updateReceiptSchema`           | 404 if no row                                   |
| `DELETE` | `/api/receipts/[id]`       | —                               | **409 + linked disbursements** if FK would fire |
| `PATCH`  | `/api/receipts/bulk`       | `bulkUpdateReceiptsSchema`      | returns updated rows                            |
| `PATCH`  | `/api/disbursements/[id]`  | `updateDisbursementSchema`      |                                                 |
| `DELETE` | `/api/disbursements/[id]`  | —                               | no FK to guard                                  |
| `PATCH`  | `/api/disbursements/bulk`  | `bulkUpdateDisbursementsSchema` | **amendment** — see §4.7 / D11                  |

> **Amendment (added after approval).** The last row is new. Entity merging
> (§4.7) needs the same id-list bulk write that store merging does, and Phase 0
> is where the write path lives — building the endpoint here rather than
> retrofitting it in Phase 1 keeps "one endpoint per table covers recategorize,
> rename and merge" (D7) true for both tables. `DataSource` correspondingly
> gains `updateDisbursements(ids, patch)` alongside `updateReceipts`.
>
> Note the static-vs-dynamic segment ordering this relies on: Next matches
> `/api/receipts/bulk` against the literal `bulk` route before the sibling
> `[id]` route. Ids are numeric, so nothing can collide with it.

**The delete guard.** Before deleting, call `disbursementsForReceipt(id)`. If
non-empty, return `409` with a usable payload rather than a raw Postgres error:

```jsonc
{
  "error": "3 disbursements refund this receipt. Delete or unlink them first.",
  "linked": [
    {
      "id": 41,
      "entity": "Amazon",
      "amount": 12.99,
      "date_received": "2026-03-02",
    },
  ],
}
```

Also catch Postgres `23503` (foreign_key_violation) from the delete itself and
map it to the same 409 — the check-then-delete window is a race, and a raw
500 with a Postgres message string is a bad UI.

### 3.5 Hooks — `src/hooks/use-finance-data.ts`

Add `useUpdateReceipt`, `useBulkUpdateReceipts`, `useDeleteReceipt`,
`useUpdateDisbursement`, `useBulkUpdateDisbursements` (§4.7 amendment),
`useDeleteDisbursement`. Every one invalidates
`RECEIPTS_KEY`; the disbursement mutations invalidate **both** keys, because a
refund's amount feeds `actual_price` via
[`mergeReceipts`](src/lib/data/merge.ts) (the existing `useAddDisbursement`
already does this — match it).

Deliberately **no optimistic updates.** Single user, and a wrong-looking number
that silently reverts is worse than a 200ms wait on a personal finance ledger.

### 3.6 Shared component — `src/components/receipt-editor.tsx`

One dialog/drawer (`useMediaQuery`, matching
[`quick-add-modal.tsx`](src/components/quick-add-modal.tsx)) used by **both** the
Stores modal and the CRUD table. `react-hook-form` + `zodResolver(updateReceiptSchema)`,
defaults from the row. Same category `Select` + "Other" escape hatch as quick-add;
factor that control out of `quick-add-modal.tsx` into
`src/components/category-select.tsx` and use it in both — it's about to have
three callers.

Include the Delete button here, with a confirm step and 409 handling that renders
the `linked` list inline.

### 3.7 Phase 0 checklist

- [ ] `002_mutable_rows.sql` written and run
- [ ] `finance_tracker_schema.sql` §4 comment corrected (§1a)
- [ ] `src/types/database.ts` regenerated
- [ ] `types.ts`: `Receipt.subscription_id`, `Receipt.updated_at`, update inputs, `DataSource` methods
- [ ] `supabase-source.ts` + `sqlite-source.ts` implement them (sqlite coalesces the two new columns)
- [ ] `schemas.ts` restructured — verify the discount-default trap is gone
- [ ] 4 new route files / 6 handlers (the `/api/disbursements/bulk` row is the §4.7 amendment)
- [ ] 6 new hooks
- [ ] `receipt-editor.tsx`, `category-select.tsx`
- [ ] **You run** `pnpm typecheck` and `pnpm lint` and report failures

---

## 4. Phase 1 — Stores page (and entities — §4.7)

Route: `/stores`, two tabs: **Stores** and **Entities**. §4.1–§4.6 describe the
Stores tab; §4.7 describes the Entities tab, which is the same machinery over
`disbursements.entity`.

### 4.1 It needs no new read endpoint

[`useMergedReceipts`](src/hooks/use-finance-data.ts) already pulls every receipt
into the client. The entire page is a client-side aggregation over data that is
already in memory. Only the _writes_ are new, and Phase 0 built those.

### 4.2 Grouping — two tiers (D6)

New file `src/lib/stores.ts`.

**Tier 1 — automatic grouping key.** Only differences that are unambiguously the
same store:

```ts
export function storeGroupKey(store: string): string {
  return store.trim().toLowerCase().replace(/\s+/g, " ");
}
```

`"Netflix"`, `" netflix "`, `"Netflix"` (double space) collapse into one row. The
**display name** is the most frequent raw spelling in the group; ties break
toward the most recently used.

**Tier 2 — suggestion-only similarity.** Never applied automatically; only ever
rendered as "these look like the same store — merge?" with a button.

```ts
export function storeSimilarityKey(store: string): string {
  return (
    storeGroupKey(store)
      .normalize("NFKD")
      // Strip combining diacritics: character class over the Unicode range
      // U+0300 to U+036F, written with \u escapes — never paste the literal
      // marks into source, they are invisible in most editors.
      .replace(COMBINING_MARKS, "")
      .replace(/\b(inc|ltd|llc|co|corp)\b/g, "")
      .replace(/\.(com|ca|net|org)\b/g, "")
      .replace(/#\d+\b/g, "") // store numbers: "Safeway #4021"
      .replace(/[^a-z0-9]/g, "")
  );
}
```

Two groups are _candidates_ when their similarity keys are equal, or one contains
the other and the shorter is ≥ 4 chars, or Levenshtein distance ≤ 2 for keys of
length ≥ 5. Write the Levenshtein in `src/lib/stores.ts` (standard two-row DP,
~20 lines).

Comparison is O(N²) in distinct stores. Prefilter on `Math.abs(len(a)-len(b)) > 2
→ skip` before computing distance; at a few hundred stores this is
sub-millisecond and needs no further optimization.

### 4.3 Row model

```ts
export interface StoreCategoryStat {
  category: string;
  count: number;
  gross: number; // sum(price)
  net: number; // sum(actual_price)
}

export interface StoreGroup {
  key: string; // storeGroupKey
  displayName: string; // most frequent raw spelling
  spellings: string[]; // every raw spelling seen, for the merge UI
  receiptIds: number[];
  receiptCount: number;
  gross: number;
  net: number;
  firstDate: string;
  lastDate: string;
  categories: StoreCategoryStat[]; // desc by count
  dominantCategory: string;
  /** receiptCount - dominant count. 0 means perfectly consistent. */
  minorityCount: number;
  isInconsistent: boolean; // categories.length > 1
}
```

Default sort: `minorityCount` desc, then `receiptCount` desc — **the stores you
are most likely to have mis-filed float to the top**, which is the entire point
of the page.

### 4.4 Page layout

- **Header strip:** count of stores, count inconsistent, count of duplicate-name
  candidates. Each is a filter toggle.
- **Duplicate-name callout** (only when candidates exist): pairs with a "Merge…"
  button opening the merge dialog.
- **Store table:** display name · receipts · gross · net · date range · **category
  mix**. The mix is a thin horizontal stacked bar segmented by category, using
  `useCategoryColors` — do not introduce a second palette; per `CLAUDE.md` that
  hook is the only source. Consistent stores render one solid bar, which makes
  inconsistency scannable without reading a number.
- Row click → modal.

### 4.5 The store modal

- Header: display name, totals, date range, category mix bar with counts.
- **Bulk bar** (the reason the page exists):
  - `Set all N receipts to [category ▾]` → `PATCH /api/receipts/bulk`
  - `Set only the M receipts not in "<dominant>" to [category ▾]` → the common case
  - `Rename store to […]` → bulk patch of `store`
  - `Merge into [existing store ▾]` → same call, target's display name
- **Receipt list:** the store's receipts, each row opening `ReceiptEditor`.
- Every bulk action shows the affected count and requires a confirm click. These
  rewrite dozens of rows at once and there is no undo.

### 4.6 Prevention — quick-add category autofill

The Stores page finds mistakes. This stops them.

In [`quick-add-modal.tsx`](src/components/quick-add-modal.tsx), the store field is
currently a plain `<input list=…>` datalist
([lines 185-201](src/components/quick-add-modal.tsx#L185-L201)). Replace with the
`Command`/`Popover` combobox already used for the refund picker in the same file
([lines 347-415](src/components/quick-add-modal.tsx#L347-L415)), plus free-text
entry for new stores.

On selecting a known store, if the category field is still untouched, set it to
that store's `dominantCategory` and show a subtle hint (`"usually Subscriptions"`)
rather than silently filling. Derived from history — **no store-defaults table**;
adding one would be a second place that knows a store's category, which §0
forbids.

### 4.7 Entities — the same problem, one column over (D11)

> **Amendment (added after approval).** Not in the original design. The ask:
> _"I also want to merge disbursement entities, not just stores, because
> sometimes I named them differently."_ Nothing in §0 objects — an entity, like
> a store's category, is an observation over the ledger rather than a stored
> fact, so fixing one means rewriting disbursements. Same principle, same shape.

**Why it belongs here and not in its own phase.** `storeGroupKey` and
`storeSimilarityKey` (§4.2) are string normalizers; they don't know what a store
is. The Levenshtein and the candidate rules are likewise field-agnostic. Only
the *aggregate* differs. So:

- Move the field-agnostic half into **`src/lib/name-groups.ts`**:
  `nameGroupKey`, `nameSimilarityKey`, `levenshtein`, `duplicateCandidates`.
  (This supersedes §4.2's placement of them in `src/lib/stores.ts` — the
  functions themselves are unchanged, only the file they live in.)
- `src/lib/stores.ts` and `src/lib/entities.ts` each build their own aggregate
  on top. Two aggregates, one similarity implementation.

**Row model.** An entity has no category axis, so there is no mix bar and no
`minorityCount`:

```ts
export interface EntityGroup {
  key: string; // nameGroupKey
  displayName: string; // most frequent raw spelling
  spellings: string[]; // every raw spelling seen, for the merge UI
  disbursementIds: number[];
  count: number;
  total: number; // sum(amount)
  refundCount: number; // rows with refunded_from_receipt != null
  refundTotal: number; // ...and their summed amount
  firstDate: string;
  lastDate: string;
}
```

Default sort: **duplicate-name candidates first**, then `count` desc. With no
category-consistency signal to rank by, near-duplicate names *are* the finding —
which is precisely what the ask was about.

**Two surfaces, because the ask named both:**

1. **The Entities tab** (`/stores`) — table of `displayName · count · total ·
   refunds · date range`, a duplicate-name callout identical to the Stores one,
   and a row-click modal whose bulk bar offers `Rename entity to […]` and
   `Merge into [existing entity ▾]`. Both are one
   `PATCH /api/disbursements/bulk` with `{ ids, patch: { entity } }`.
2. **The table editor** (`/manage` → Disbursements tab, §5) — multi-select rows,
   then **"Set entity"** in the selection action bar. Same endpoint. This is the
   escape hatch for the cases grouping can't see, e.g. two genuinely different
   spellings that share no substring.

**Refunds are untouched by a rename.** `refunded_from_receipt` is a foreign key,
not a name, so merging entities cannot disturb `actual_price` anywhere. That is
the whole reason this is safe to do in bulk while editing a refund *amount*
(§5) is not.

**Prevention already exists.** The quick-add Entity field has used
`AutocompleteInput` over every entity in history since the bulk-add session, so
new drift is already unlikely — this page is for the backlog of names created
before it did.

`002_mutable_rows.sql` adds `disbursements_entity_idx` for the grouping read,
mirroring `receipts_store_idx`.

### 4.8 Phase 1 checklist

- [ ] `src/lib/name-groups.ts` — keys, Levenshtein, duplicate candidates (§4.7)
- [ ] `src/lib/stores.ts` — `buildStoreGroups` on top of it
- [ ] `src/lib/entities.ts` — `buildEntityGroups` on top of it
- [ ] `src/app/stores/page.tsx` (Stores / Entities tabs), `src/components/store-detail-modal.tsx`, `src/components/entity-detail-modal.tsx`, `src/components/store-merge-dialog.tsx` (generic over field)
- [ ] Category-mix bar component (reuses `useCategoryColors`)
- [ ] Quick-add store combobox + category autofill hint
- [ ] Nav entry (§7.1)
- [ ] **You run** `pnpm dev`, click through, report

---

## 5. Phase 2 — CRUD tables

Route: `/manage`, tabs for Receipts and Disbursements.

Deliberately thin, because Phase 0 did the work: this page is
[`receipts-table.tsx`](src/components/receipts-table.tsx) plus a row-action column
plus multi-select, wired to the Phase 0 hooks and `ReceiptEditor`.

- **Reuse, don't fork** `ReceiptsTable`. Add optional props `editable?: boolean`
  and `selectable?: boolean`; when set it renders a checkbox column, an edit
  button per row, and a selection action bar. The existing read-only callers pass
  neither and are unaffected.
- **Selection action bar:** receipts get "Set category", "Set store", "Delete N";
  disbursements get **"Set entity"** and "Delete N" (§4.7) — the same two bulk
  endpoints Phase 1 uses.
- **Disbursements tab** matters as much as receipts: a wrong refund amount
  silently corrupts `actual_price` on every net-paid figure across the app.
  It also needs a `DisbursementEditor` mirroring the `ReceiptEditor` Phase 0
  built — the `PATCH`/`DELETE` routes and hooks for it already exist and are
  unused until this phase.
- Add a `Sub` badge on rows with `subscription_id != null` (Phase 3), linking to
  the subscription.
- Show `updated_at` as a "last edited" column.

**Deliberately out of scope:** server-side pagination and sorting. The app loads
the full table on every page already; this changes nothing about that. Revisit
when receipt count makes the initial fetch noticeable — note it in `PROGRESS.md`,
don't pre-build it.

### 5.1 Phase 2 checklist

- [ ] `ReceiptsTable` gains `editable` / `selectable` (existing callers untouched)
- [ ] `src/app/manage/page.tsx` with both tabs
- [ ] `src/components/disbursements-table.tsx` (editable equivalent)
- [ ] `src/components/disbursement-editor.tsx` (mirrors Phase 0's `receipt-editor.tsx`)
- [ ] Bulk selection action bar — incl. "Set entity" on disbursements (§4.7)
- [ ] Nav entry (§7.1)

---

## 6. Phase 3 — Subscriptions

Route: `/subscriptions`. The largest phase and the only one with real design risk.

### 6.0 Subscriptions keep their own categories (D9)

There is deliberately **no `Subscriptions` category**, and
[`CATEGORY_OPTIONS`](src/lib/data/types.ts#L2-L15) is not extended. Each
subscription carries whatever category its spending actually _is_ — one is filed
under Professional Development, others elsewhere — because that's the axis every
existing chart, filter, and heatmap slices by. A catch-all category would say
"this was a recurring payment," which is a _funding mechanism_, not a kind of
spending, and it would flatten real distinctions across the whole history.

`subscription_id` is the grouping axis instead: it's what the `Sub` badge (§5),
the "view generated receipts" link (§6.9), and any future "what do my recurring
payments cost me" view read.

This is also what closes the loop on the problem that started this work. The
original pain was _"for subscriptions, I sometimes forget what category it goes
into."_ Once a subscription row exists it **pins** its own store→category pairing
permanently, and the cron files every future charge identically. Phase 1 finds the
past inconsistencies; a subscription prevents the future ones for that store,
without a store-defaults table (§4.6).

### 6.1 Migration: `supabase/migrations/003_subscriptions.sql`

```sql
create table if not exists finance_tracker.subscriptions (
    id                bigint generated by default as identity primary key,
    name              text    not null,                    -- "Netflix Standard"
    store             text    not null,                    -- goes onto the receipt
    category          text    not null,                    -- goes onto the receipt
    price             numeric not null check (price > 0),   -- CURRENT price only (D4)
    interval_unit     text    not null check (interval_unit in ('day','week','month','year')),
    interval_count    int     not null default 1 check (interval_count >= 1),
    start_date        date    not null,                    -- date of the FIRST charge
    charges_generated int     not null default 0 check (charges_generated >= 0),
    active            boolean not null default true,
    note              text,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

alter table finance_tracker.receipts
    add column if not exists subscription_id bigint
    references finance_tracker.subscriptions (id);

-- THE idempotency guard. Makes a double-charge impossible at the database
-- layer rather than in application logic (§6.4).
create unique index if not exists receipts_subscription_charge_uniq
    on finance_tracker.receipts (subscription_id, date)
    where subscription_id is not null;

create index if not exists receipts_subscription_id_idx
    on finance_tracker.receipts (subscription_id)
    where subscription_id is not null;

drop trigger if exists subscriptions_set_updated_at on finance_tracker.subscriptions;
create trigger subscriptions_set_updated_at
    before update on finance_tracker.subscriptions
    for each row execute function finance_tracker.set_updated_at();

-- A custom schema inherits NO default privileges (see finance_tracker_schema.sql
-- §4) — a new table without this line is unreachable, secret key or not.
revoke all on finance_tracker.subscriptions from public, anon, authenticated;
grant select, insert, update, delete on finance_tracker.subscriptions to service_role;
alter table finance_tracker.subscriptions enable row level security;  -- zero policies, per Pattern A
```

Regenerate `src/types/database.ts` afterwards.

### 6.2 Recurrence math — `src/lib/subscriptions.ts`

**The bug to not write.** Repeatedly doing `next = next + 1 month` permanently
drifts a 31st-of-the-month subscription to the 28th the first time it passes
February. Compute the **nth occurrence from `start_date`** instead, so every date
is derived independently and drift is structurally impossible:

```ts
export type IntervalUnit = "day" | "week" | "month" | "year";

/** Date of charge number `n` (n = 0 is start_date itself). */
export function nthChargeDate(
  startISO: string,
  unit: IntervalUnit,
  count: number,
  n: number,
): string {
  if (unit === "day") return addDaysISO(startISO, n * count);
  if (unit === "week") return addDaysISO(startISO, n * count * 7);

  const months = unit === "year" ? n * count * 12 : n * count;
  const d = new Date(`${startISO}T00:00:00Z`);
  const anchorDay = d.getUTCDate();
  const target = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1),
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(anchorDay, lastDay)); // clamp, don't overflow
  return target.toISOString().slice(0, 10);
}
```

The clamp is what makes Jan 31 → **Feb 28** → **Mar 31** (not Mar 28). It also
handles Feb 29 annuals → Feb 28 in common years. All UTC, matching
[`src/lib/dates.ts`](src/lib/dates.ts)'s existing convention.

`nextChargeDate(sub) = nthChargeDate(sub.start_date, …, sub.charges_generated)`.
It is **derived, never stored** — nothing can desync from itself.

### 6.3 Catch-up, not "is today the day" (D2)

```ts
export const MAX_CHARGES_PER_SUB_PER_RUN = 60;

export function dueChargesFor(sub: Subscription, todayISO: string) {
  const out: { date: string; chargeIndex: number }[] = [];
  if (!sub.active) return { charges: out, capped: false };

  let n = sub.charges_generated;
  while (out.length < MAX_CHARGES_PER_SUB_PER_RUN) {
    const date = nthChargeDate(
      sub.start_date,
      sub.interval_unit,
      sub.interval_count,
      n,
    );
    if (date > todayISO) break; // lexicographic === chronological for ISO dates
    out.push({ date, chargeIndex: n });
    n += 1;
  }
  return { charges: out, capped: out.length === MAX_CHARGES_PER_SUB_PER_RUN };
}
```

What this design buys, and why it beats a "did today's charge fire" check:

| Situation                                             | Outcome                                                                |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| Cron skipped a day (deploy, outage, Hobby-plan delay) | Next run writes both days. Self-heals.                                 |
| Cron fires twice in a day                             | Second run finds nothing due. No-op.                                   |
| A charge insert fails                                 | `charges_generated` doesn't advance → retried tomorrow, automatically. |
| First run ever / backfilling an old subscription      | Same code path. No special case.                                       |

**The cap is a safety valve, not a limit.** A mistyped `start_date` of `1990-01-01`
on a daily subscription would otherwise generate ~13,000 receipts in one run. The
cap bounds the damage to 60, the run reports it, and the remainder trickles in on
subsequent days — by which point you will have noticed the email.

### 6.4 Idempotency and the crash window

The guard is `unique (subscription_id, date)` from §6.1. The sequence is: insert
receipt → then advance `charges_generated`. A crash between the two leaves the
counter behind, so the next run recomputes the _same_ due date and the insert
fails with `23505`.

**Rule: treat `23505` unique_violation on a subscription charge insert as
success-already-recorded — advance the counter and record it as `skipped`, not
`failed`.** That one line is what makes the whole design self-repairing without
transactions. It is the most important behavior in Phase 3; a reviewer who
doesn't understand why it's there will delete it.

### 6.5 Timezone

[`todayISO()`](src/lib/filters.ts#L12) uses the _server's_ local zone. On Vercel
that is UTC, so a midnight-UTC cron dates charges a day early relative to
Mountain time. Add to `src/lib/dates.ts`:

```ts
export function todayInZone(timeZone: string): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the app's date convention.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
```

New env var `APP_TIMEZONE`, defaulting to **`America/Toronto`** in
[`src/lib/config.ts`](src/lib/config.ts) (confirmed). The cron uses
`todayInZone(APP_TIMEZONE)`; nothing else changes. Note the zone observes DST, so
the UTC cron hour maps to a different local hour half the year — irrelevant to
correctness here, since the catch-up design only cares about the _date_.

### 6.6 The cron route — a new security boundary

`GET /api/cron/subscriptions` **cannot** call `requireOwnerForApi()`; there is no
session. This is the app's first unauthenticated write endpoint and its largest
new attack surface. `CLAUDE.md`'s hard rules must be amended to name it as the
single, explicit exception — an unexplained handler without `requireOwnerForApi()`
should otherwise read as a bug.

```ts
export const dynamic = "force-dynamic";
// Hobby allows up to 60s; the default 10s is thin if a backfill inserts dozens
// of receipts sequentially. The per-sub cap (§6.3) bounds the worst case.
export const maxDuration = 60;

function requireCronSecret(request: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  // Fail closed: unset secret means the endpoint is off, not open.
  if (!expected)
    return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const got = request.headers.get("authorization") ?? "";
  const want = `Bearer ${expected}`;
  const a = Buffer.from(got),
    b = Buffer.from(want);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}
```

Vercel sends `Authorization: Bearer $CRON_SECRET` automatically once the env var
is set. Fail-closed-when-unset mirrors how `OWNER_USER_IDS` behaves with an empty
value, which is the correct direction.

`vercel.json`:

```json
{ "crons": [{ "path": "/api/cron/subscriptions", "schedule": "0 12 * * *" }] }
```

**This account is on Vercel Hobby** (confirmed), which means: **one cron total**,
**daily granularity only**, **no guaranteed minute** (it fires within the hour of
the stated time), and **production deployments only** — a preview deploy will
never run it. Every one of those constraints is a non-issue under the catch-up
design, which is the third argument for it. `0 12 * * *` is 08:00 EDT / 07:00 EST.

One Hobby consequence that _does_ bind: with a single cron slot, this endpoint is
it. Anything else that ever needs scheduling has to be folded into this same
handler rather than getting its own entry.

**Manual trigger.** The browser must never see `CRON_SECRET`, so the "Run due
charges" button hits a _separate_ owner-gated route,
`POST /api/subscriptions/run-due`, guarded by `requireOwnerForApi()`. Both routes
are thin wrappers over one shared `runDueSubscriptionCharges()` in
`src/lib/subscriptions-runner.ts`.

### 6.7 Run result

```ts
export interface SubscriptionRunResult {
  today: string;
  inserted: {
    subscriptionId: number;
    name: string;
    date: string;
    price: number;
    receiptId: number;
  }[];
  skipped: {
    subscriptionId: number;
    name: string;
    date: string;
    reason: "already-charged";
  }[];
  failed: {
    subscriptionId: number;
    name: string;
    date: string;
    price: number;
    store: string;
    category: string;
    error: string;
  }[];
  capped: { subscriptionId: number; name: string }[];
}
```

Returned as JSON from both routes — useful in Vercel logs and as the manual
button's response.

### 6.8 Email (Resend)

`pnpm add resend`. Env: `RESEND_API_KEY`, `SUBSCRIPTION_EMAIL_TO`,
`SUBSCRIPTION_EMAIL_FROM`. Confirmed values (non-secret, so recorded here rather
than in `.env.example`, which per `CLAUDE.md` carries no real values):

```
SUBSCRIPTION_EMAIL_TO=kyleaphagerman@gmail.com
SUBSCRIPTION_EMAIL_FROM=Finance Tracker <finances@kylehagerman.dev>
```

- **Send only when `inserted`, `failed`, or `capped` is non-empty.** A daily "0
  charges" email trains you to ignore the one that matters.
- Success subject: `💸 3 subscription charges — $47.98`. Body: a table of date /
  name / store / category / price. Seeing the amount is how you catch a price
  rise the subscription doesn't know about yet — at which point Phase 2 lets you
  fix the receipt and the subscription form lets you fix the price.
- Failure subject: `⚠️ Subscription charge failed`. Include the full field set
  per failure so it's copy-pasteable into quick-add, and state plainly that **it
  will retry automatically tomorrow** — otherwise the email reads as more urgent
  than it is.
- **Email failure must never be fatal.** Insert first, email after, wrap the send
  in try/catch and swallow it into a log line. A Resend outage must not roll back
  or re-attempt a receipt that is already correct.

### 6.9 The page

- **Table:** name · store · category · price · cadence ("Monthly", "Every 3
  months") · next charge · status.
- **Status badges:** `Active`, `Paused`, and **`Due`/`Overdue`** when
  `nextChargeDate <= todayInZone(APP_TIMEZONE)`.
- **This is the real safety net.** A subscription showing `Overdue` for more than
  a day means the cron isn't running — visible in the UI you actually look at,
  not only in an email you might miss.
- **Actions:** Edit · Pause/Resume · Charge now (writes the single next due
  charge) · Delete · "View generated receipts" (filters `/manage` by
  `subscription_id`).
- **Header button:** "Run due charges" → `POST /api/subscriptions/run-due`, then
  toast the `SubscriptionRunResult` summary.
- **Create form warning:** a `start_date` in the past backfills. Compute
  `dueChargesFor()` live in the form and show _"This will create 7 receipts
  totalling $111.93 on the next run"_ before saving. Silent backfill of a
  mistyped date is the worst failure mode this feature has.

**Deleting a subscription** is blocked when receipts reference it (same shape as
the receipt delete guard, §3.4) — offer Pause instead. Generated receipts keep
their provenance; `on delete set null` would quietly discard it.

### 6.10 Routes

| Method           | Path                                 | Auth                             |
| ---------------- | ------------------------------------ | -------------------------------- |
| `GET` `POST`     | `/api/subscriptions`                 | `requireOwnerForApi`             |
| `PATCH` `DELETE` | `/api/subscriptions/[id]`            | `requireOwnerForApi` (409 on FK) |
| `POST`           | `/api/subscriptions/[id]/charge-now` | `requireOwnerForApi`             |
| `POST`           | `/api/subscriptions/run-due`         | `requireOwnerForApi`             |
| `GET`            | `/api/cron/subscriptions`            | **`CRON_SECRET` bearer**         |

### 6.11 Phase 3 checklist

- [ ] `003_subscriptions.sql` run; `database.ts` regenerated
- [ ] `Subscription` type + `DataSource` methods; `SqliteDataSource` throws "not supported in sqlite mode" (D8)
- [ ] `src/lib/subscriptions.ts` — `nthChargeDate`, `nextChargeDate`, `dueChargesFor`, cadence labels
- [ ] `src/lib/subscriptions-runner.ts` — `runDueSubscriptionCharges()`, **incl. the 23505 rule (§6.4)**
- [ ] `todayInZone` + `APP_TIMEZONE`
- [ ] 5 routes; `vercel.json`; `CRON_SECRET` set in Vercel
- [ ] `src/lib/email.ts` (Resend), digest + failure templates
- [ ] `/subscriptions` page, form with backfill warning, overdue badges
- [ ] `CLAUDE.md` hard rules amended for the cron exception
- [ ] **You verify:** create a monthly sub dated 3 months ago → run-due writes exactly 3 receipts → run again → writes 0

---

## 7. Cross-cutting

### 7.1 Navigation

[`nav.tsx`](src/components/nav.tsx#L11-L18) holds 6 links in a horizontally
scrolling row. Adding Stores, Manage, and Subscriptions takes it to 9, which
overflows on desktop.

Split by intent: **analysis** stays inline (Overview, Daily, Monthly, Categories,
Savings, Disbursements); **data management** moves into a "Manage ▾" popover
(Stores, Receipts, Subscriptions) using the existing `Popover` primitive. Active
state highlights the trigger when any child route is active.

### 7.2 New environment variables

Add to `.env.example` **and** all three Vercel environments:

| Var                       | Phase | Notes                                                                                      |
| ------------------------- | ----- | ------------------------------------------------------------------------------------------ |
| `APP_TIMEZONE`            | 3     | IANA zone for "today". Defaults to `America/Toronto` in `config.ts`.                       |
| `CRON_SECRET`             | 3     | Vercel auto-sends it as a bearer token. Unset ⇒ endpoint 503s (fail closed).               |
| `RESEND_API_KEY`          | 3     | Server-only. Never `NEXT_PUBLIC_`.                                                         |
| `SUBSCRIPTION_EMAIL_TO`   | 3     | `kyleaphagerman@gmail.com`                                                                 |
| `SUBSCRIPTION_EMAIL_FROM` | 3     | `Finance Tracker <finances@kylehagerman.dev>` — domain is confirmed to be Resend-verified. |

### 7.3 Security invariants after this work

1. Every route handler still begins with `requireOwnerForApi()` — **except**
   `/api/cron/subscriptions`, which begins with `requireCronSecret()`. There are
   exactly two gates and no third.
2. `SUPABASE_SECRET_KEY`'s blast radius is now **full read/write/delete**, not
   read/insert. Update the note in `.env.example` accordingly.
3. Update payloads are built only from `parsed.data`, never from the raw body, so
   `id` / `created_at` / `updated_at` / `subscription_id` stay unpatchable (§3.3).
4. `CRON_SECRET` reaches only server code. The UI's manual trigger uses the
   owner-gated route instead.

### 7.4 Files touched, by phase

```
Phase 0  supabase/migrations/002_mutable_rows.sql          [new]
         supabase/migrations/finance_tracker_schema.sql    [comment fix]
         src/types/database.ts                             [regen]
         src/lib/data/{types,schemas,supabase-source,sqlite-source}.ts
         src/lib/data/errors.ts                            [new]
         src/lib/api.ts                                    [new]
         src/app/api/receipts/[id]/route.ts                [new]
         src/app/api/receipts/bulk/route.ts                [new]
         src/app/api/disbursements/[id]/route.ts           [new]
         src/app/api/disbursements/bulk/route.ts           [new, §4.7]
         src/hooks/use-finance-data.ts
         src/components/{receipt-editor,category-select}.tsx  [new]
         src/components/quick-add-modal.tsx                [uses CategorySelect]

Phase 1  src/lib/{name-groups,stores,entities}.ts          [new, §4.7]
         src/app/stores/page.tsx                           [new]
         src/components/{store-detail-modal,entity-detail-modal,store-merge-dialog,category-mix-bar}.tsx  [new]
         src/components/quick-add-modal.tsx                [store combobox + autofill]

Phase 2  src/app/manage/page.tsx                           [new]
         src/components/disbursements-table.tsx            [new]
         src/components/disbursement-editor.tsx            [new]
         src/components/receipts-table.tsx                 [+editable/+selectable]

Phase 3  supabase/migrations/003_subscriptions.sql         [new]
         src/lib/{subscriptions,subscriptions-runner,email}.ts  [new]
         src/lib/{dates,config}.ts                         [todayInZone, APP_TIMEZONE]
         src/app/subscriptions/page.tsx                    [new]
         src/app/api/subscriptions/**                      [new]
         src/app/api/cron/subscriptions/route.ts           [new]
         vercel.json                                       [new]
         CLAUDE.md                                         [cron exception]

All      src/components/nav.tsx, .env.example, PROGRESS.md
```

### 7.5 Deployment state, and what that means for verification

**The app is not on Vercel yet.** The SQLite→Supabase backfill _has_ run, so the
Supabase schema is live and populated and every phase is developable and testable
against real data locally. The plan is to deploy once all three phases are done.

The consequence for Phase 3: **Vercel crons run against production deployments
only**, so the scheduled path cannot be exercised at all before the first deploy.
Split verification accordingly —

- **Locally, pre-deploy:** everything except the schedule. `dueChargesFor` /
  `nthChargeDate` are pure functions over strings, and
  `POST /api/subscriptions/run-due` is the same `runDueSubscriptionCharges()` the
  cron calls, behind `requireOwnerForApi()` instead of `CRON_SECRET`. Hitting that
  button exercises the entire runner: due-detection, insert, counter advance, the
  23505 replay rule, the cap, and the email. Only the trigger differs.
- **Post-deploy:** set `CRON_SECRET` in Vercel (which is what makes Vercel start
  sending the bearer header), confirm the endpoint 401s without it and 503s if the
  var is missing, then wait for one scheduled firing and check the run's JSON in
  the Vercel function logs.

Deployment order that avoids a half-configured production: deploy **after** Phase
3 is merged, mirroring every new env var from §7.2 into Production, Preview _and_
Development in the same pass. `PROGRESS.md`'s existing "bring this online"
backlog still applies — this adds five env vars to its step 9, and `vercel.json`
must be committed before the first deploy or the cron simply won't exist.

---

## Appendix A — deferred: pre-announced price changes

Not built. The trigger to build it: you get a "your price increases on <date>"
email and want to record it _now_ without corrupting today's numbers.

```sql
create table finance_tracker.subscription_price_changes (
    id              bigint generated by default as identity primary key,
    subscription_id bigint  not null references finance_tracker.subscriptions (id) on delete cascade,
    effective_date  date    not null,
    price           numeric not null check (price > 0),
    unique (subscription_id, effective_date)
);
```

The runner would resolve the price for a charge as _the latest change with
`effective_date <= charge_date`, else `subscriptions.price`_. That's the only
change; everything else in §6 already works. Note this table is a schedule, not
history — §0's ban on a second source of truth for past spending still holds.

Until then: when a price rises, edit the subscription's `price`. Past receipts
keep the old amount because they are facts.

## Appendix B — explicitly out of scope

- **Soft deletes / audit log.** Rejected (D5). `updated_at` is the compromise.
- **Server-side pagination.** The app already loads everything (§5).
- **Optimistic UI updates.** §3.5.
- **A store→category defaults table.** Derived from history instead (§4.6).
- **Subscriptions under `DATA_SOURCE=sqlite`.** Dev-only mode, no such table (D8).
- **Multi-currency, shared/split subscriptions, reminders before a charge.**
