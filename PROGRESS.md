# PROGRESS.md

Rolling log of what's been built, what's in progress, and what's next. **Update this every session** — it's how Claude Code (and the user) know where things stand without re-reading `SPEC.md` end-to-end.

## How to use this file

- When you **start** a task, move it from `Backlog` → `In progress` and add the date.
- When you **finish** a task, move it to `Done` with a one-line note about anything notable (decisions made, deviations from spec, gotchas).
- If you discover something to revisit later, drop it under `Follow-ups`.
- If you make a decision the spec left open (e.g. plotting library, file layout details), record it under `Decisions`.

---

## Decisions

- [x] **Plotting library: Plotly** — chosen for native hover tooltips required by the daily stacked bar chart.
- [x] Category sort order for color mapping: alphabetical.
- [x] **Savings formula confirmed by user (2026-05-09)**: `price` in the DB is post-discount. Formula is `price = (original - discount) * (1 - discount_percentage/100)`. Therefore:
  - Savings from flat discount = `discount`
  - Savings from percentage discount = `price * discount_percentage / (100 - discount_percentage)`
  - Total savings per receipt = sum of both.

## Done

- **2026-05-09** — Full initial build: all 10 backlog items completed in one session.
  - `requirements.txt` (streamlit, pandas, plotly)
  - `finance_tracker/` package: `data.py`, `colors.py`, `filters.py`, `charts.py`
  - `app.py` (Overview), `pages/1_Daily.py`, `pages/2_Categories.py`, `pages/3_Savings.py`
  - Filter bar persists in session state; Refresh button clears cache.
  - Net-paid toggle wired through all pages and charts.

## In progress

_Empty._

## Backlog

_All items complete._

## Follow-ups

- [ ] Editing UI (deferred — read-only for now per CLAUDE.md).
- [ ] Consider adding a `pages/4_Disbursements.py` for standalone disbursements (gifts, unlinked income) if the user wants to view those separately.

## Notes / gotchas

- DB is at the path in `config.py`. Don't hardcode it elsewhere.
- Disbursements with `refunded_from_receipt = NULL` must NOT subtract from any receipt's `actual_price` — only linked disbursements are summed as refunds.
- Discounts: `discount` is flat, `discount_percentage` is percent. `price` in the DB is already post-discount.
- Savings calculation: `discount + price * discount_percentage / (100 - discount_percentage)`. Edge case: `discount_percentage = 100` is guarded (uses full `price` as savings).
- Color palette: `plotly.colors.qualitative.Dark24` via `finance_tracker/colors.py`.
