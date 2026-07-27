# SPEC.md — Finance Tracker

Full specification for the Streamlit finance tracker. Read the section relevant to your task; you don't need to re-read the whole file each session.

## Section index

- [1. Data model](#1-data-model)
- [2. Core data layer](#2-core-data-layer)
- [3. Filters](#3-filters)
- [4. Net-paid toggle](#4-net-paid-toggle)
- [5. Color mapping](#5-color-mapping)
- [6. Pages](#6-pages)
  - [6.1 Overview](#61-overview)
  - [6.2 Daily](#62-daily)
  - [6.3 Categories](#63-categories)
  - [6.4 Savings](#64-savings)
- [7. Caching & refresh](#7-caching--refresh)
- [8. Future-proofing for editing](#8-future-proofing-for-editing)

---

## 1. Data model

The SQLite DB has two tables. Schema as given:

```sql
CREATE TABLE receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL,
    discount REAL DEFAULT 0,
    discount_percentage REAL DEFAULT 0,
    note TEXT,
    date TEXT NOT NULL
);

CREATE TABLE disbursements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity TEXT NOT NULL,
    amount REAL NOT NULL,
    date_received TEXT NOT NULL,
    reason TEXT,
    refunded_from_receipt INTEGER,
    FOREIGN KEY(refunded_from_receipt) REFERENCES receipts(id)
);
```

Notes:
- `date` and `date_received` are stored as TEXT (ISO `YYYY-MM-DD`). Parse to datetime on load.
- `discount` is a flat amount; `discount_percentage` is a percent off. Either can be 0. A receipt "has a discount" if `discount > 0 OR discount_percentage > 0`.
- A disbursement may have `refunded_from_receipt = NULL` — that's a standalone receipt-of-money (e.g. a gift, an unrelated payment received). It does NOT subtract from any receipt's price.
- Only disbursements with non-null `refunded_from_receipt` participate in the net-paid calculation.

## 2. Core data layer

Build a module (suggested: `finance_tracker/data.py`) exposing at least:

- `load_receipts() -> pd.DataFrame` — all receipts, with `date` parsed to datetime.
- `load_disbursements() -> pd.DataFrame` — all disbursements, with `date_received` parsed to datetime.
- `load_merged_receipts() -> pd.DataFrame` — receipts left-joined with summed disbursements per `refunded_from_receipt`. Columns must include everything from `receipts` plus `total_refunded` (0 when none) and `actual_price = price - total_refunded`.

Reference implementation pattern (from the user's notebook — port this faithfully):

```python
df_receipts = (
    df_receipts_original
    .merge(
        df_disbursements.groupby("refunded_from_receipt")["amount"].sum(),
        how="left",
        left_on="id",
        right_index=True,
    )
    .rename(columns={"amount": "total_refunded"})
    .assign(total_refunded=lambda d: d["total_refunded"].fillna(0))
    .assign(actual_price=lambda d: d["price"] - d["total_refunded"])
)
```

All three loaders should use `@st.cache_data` (see [§7](#7-caching--refresh)). The DB path comes from `config.DB_PATH`.

If the DB file is missing or unreadable, raise a clean error that the app can catch and display via `st.error`.

## 3. Filters

Filters render as a **horizontal bar at the top of each page** (use `st.columns` to lay them out). The same filter component should be reusable across pages — implement it once (suggested: `finance_tracker/filters.py`) and call it from each page.

Filters:

| Filter | Widget | Notes |
|---|---|---|
| Date range | `st.date_input` with two values | Default: last 30 days (today − 29 → today). Applies to `receipts.date` and, where relevant, `disbursements.date_received`. |
| Category | `st.multiselect` | Options = distinct categories. Empty selection = no filter (show all). |
| Store | `st.multiselect` | Options = distinct stores. Empty = all. |
| Entity (disbursement-side) | `st.multiselect` | Only shown on pages that involve disbursements directly (e.g. Savings if it lists incoming money). On receipt-only pages, omit. |
| Has discount | `st.selectbox` with options "Any / Yes / No" | "Yes" = `discount > 0 OR discount_percentage > 0`. |

**Filter state should persist across pages within a session.** Use `st.session_state` keyed by filter name. When the user navigates to another page, the same filters apply (where applicable).

The filter component returns a `Filters` dataclass (or dict) with the selected values. A separate function `apply_filters(df, filters) -> pd.DataFrame` applies them to a receipts DataFrame.

## 4. Net-paid toggle

A single checkbox: **"Subtract refunds (show net paid)"**, default **checked**, placed in the filter bar.

When checked, charts and tables use `actual_price`. When unchecked, they use `price`. The y-axis label / column header should update accordingly ("Net paid" vs "Gross paid").

This toggle, like the filters, persists in `st.session_state` across pages.

## 5. Color mapping

Generate one mapping `{category: color}` at app startup, derived from the distinct categories in the DB. Implementation (suggested: `finance_tracker/colors.py`):

- Sort distinct categories alphabetically (or by total spend desc — pick one and stay consistent; alphabetical is simpler).
- Assign colors from a qualitative palette with enough distinct hues. Plotly's `plotly.colors.qualitative.Set3` / `Dark24`, Altair's `tableau20`, or matplotlib's `tab20` are all fine. If there are more categories than palette slots, cycle.
- Cache the mapping with `@st.cache_data` so it's stable across reruns within a session.
- Expose `get_category_colors() -> dict[str, str]`. Every chart imports and uses this.

The mapping must be **identical on every page**. Add a small "Legend" section or rely on each chart's built-in legend, but the colors themselves come from this single source.

## 6. Pages

Use Streamlit's multi-page convention (`pages/` directory). Page order in the sidebar should match the list below.

Every page:
1. Renders the filter bar at the top.
2. Loads cached data via the data layer.
3. Applies filters.
4. Renders the page-specific content.
5. Has a "Refresh data" button somewhere visible (a single shared button in the filter bar is fine — it clears `st.cache_data` and reruns).

### 6.1 Overview

The landing page (`app.py`).

Content:
- **Headline KPIs** in a row of metric cards (`st.metric`):
  - Total spend (sum of `actual_price` or `price` per the toggle, within the filtered range).
  - Number of receipts in range.
  - Average spend per day in range.
  - Total refunded in range (sum of `total_refunded` for receipts in range).
- **A short data table** of the most recent ~10 receipts in range, with columns: date, store, category, price, total_refunded, actual_price, note. Sortable; use `st.dataframe`.
- **Mini summary chart**: spend per day as a simple bar chart (no category breakdown — the Daily page handles that).

### 6.2 Daily

The daily breakdown — port the user's `plot_transactions_by_date` concept.

- A **stacked bar chart**: x-axis = date, y-axis = amount, each bar is divided into segments per receipt of that day, colored by category using the global color map.
- **Hover tooltip** on each segment shows: store, category, amount, note (if present).
- **Legend**: one entry per category present in the filtered data, using the global color map.
- Below the chart, a filterable table of the receipts feeding the chart.

The user's notebook implementation uses matplotlib without hover. The Streamlit version must support hover — pick a plotting library accordingly.

### 6.3 Categories

Port the user's `plot_by_category` concept.

- A **pie chart** of total spend by category (using global color map).
  - Slices labeled with category name and total amount; percentages also visible.
- A **mode toggle**: "Sum" vs "Mean" — pie shows sum or mean of `actual_price`/`price` per category.
- A **table** beneath the pie listing each category with: total, mean, count of receipts, % of total.

### 6.4 Savings

The "savings" view. **Total savings = sum of receipt-level discounts** (both flat `discount` and the implied savings from `discount_percentage`).

- A flat discount on a receipt saves `discount`.
- A percentage discount saves `price * discount_percentage / (100 - discount_percentage)` if `price` is post-discount, OR `price * discount_percentage / 100` if `price` is pre-discount. **Ask the user which convention `price` follows before implementing this calculation** — note the ambiguity in `PROGRESS.md` and pick the simpler interpretation (`price * discount_percentage / 100`) as a placeholder until clarified.
- Show:
  - **Total savings KPI** for the filtered range.
  - **Savings over time** line or bar chart (per day or per week — daily for ranges ≤ 60 days, weekly otherwise).
  - **Savings by category** small bar chart using the global color map.

**Spend extrapolation** also lives on this page (it's adjacent to budgeting):
- Compute average spend per day over the filtered date range.
- Show projected spend per **day**, **week**, **month** based on that average. A small table with three rows is fine.
- A line chart with cumulative spend in the filtered range plus a dashed extrapolation line extending the trend forward by 30 days. Make the extrapolation visually distinct.

## 7. Caching & refresh

- All DB reads use `@st.cache_data`. The cache key is the file mtime of the DB plus the function args, so external edits to the DB are picked up after a refresh.
  - Practical pattern: a small helper `_db_mtime() -> float` that returns `os.path.getmtime(config.DB_PATH)`. Pass it as an argument (or make it part of a wrapping function) so the cache invalidates when the file changes.
- The filter bar contains a **Refresh** button (`st.button("🔄 Refresh")`) that calls `st.cache_data.clear()` and `st.rerun()`.
- Do NOT use a TTL — the DB is local and small; mtime-based invalidation plus the manual button is enough.

## 8. Future-proofing for editing

The app is read-only now, but the structure should make adding edits straightforward later:

- All DB access goes through the data layer module — no inline `sqlite3` calls in pages.
- The data layer should open connections in a way compatible with writes later (e.g. a `get_connection()` helper that currently returns a read-only connection but could be flipped). Document this in code comments.
- Page code should never assume DataFrames are immutable views of the DB — use `.copy()` where ambiguity could cause issues if a write path is added.

Do NOT add edit/delete UI in this phase. Do NOT add forms for inserting rows.
