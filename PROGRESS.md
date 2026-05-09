# PROGRESS.md

Rolling log of what's been built, what's in progress, and what's next. **Update this every session** — it's how Claude Code (and the user) know where things stand without re-reading `SPEC.md` end-to-end.

## How to use this file

- When you **start** a task, move it from `Backlog` → `In progress` and add the date.
- When you **finish** a task, move it to `Done` with a one-line note about anything notable (decisions made, deviations from spec, gotchas).
- If you discover something to revisit later, drop it under `Follow-ups`.
- If you make a decision the spec left open (e.g. plotting library, file layout details), record it under `Decisions`.

---

## Decisions

_Record one-time architectural decisions here so future sessions don't re-debate them._

- [ ] Plotting library: **TBD** — pick on first chart task and record it here.
- [ ] Category sort order for color mapping: alphabetical (per spec default).

## Done

_Empty — nothing built yet._

## In progress

_Empty._

## Backlog

Rough order of attack. Adjust if dependencies suggest otherwise.

1. **Project scaffold** — `requirements.txt`, package skeleton (`finance_tracker/`), empty page files, `app.py` boots.
2. **Data layer** (`finance_tracker/data.py`) — `load_receipts`, `load_disbursements`, `load_merged_receipts`, with `@st.cache_data` and mtime-based invalidation. Reads `config.DB_PATH`.
3. **Color mapping** (`finance_tracker/colors.py`) — `get_category_colors()` returning a stable dict.
4. **Filter component** (`finance_tracker/filters.py`) — horizontal filter bar, session-state-backed, returns a Filters object; plus `apply_filters(df, filters)`.
5. **Net-paid toggle** — wired into the filter bar, persisted in session state.
6. **Refresh button** — clears `st.cache_data`, reruns.
7. **Overview page** (`app.py`) — KPIs, recent receipts table, mini per-day bar chart.
8. **Daily page** (`pages/1_Daily.py`) — stacked bar chart with hover tooltips + table.
9. **Categories page** (`pages/2_Categories.py`) — pie chart + sum/mean toggle + summary table.
10. **Savings page** (`pages/3_Savings.py`) — savings KPI, savings over time, savings by category, spend extrapolation.

## Follow-ups

_Items noticed during implementation that are out of scope for the current task._

- [ ] Confirm with user: does `receipts.price` represent the pre-discount or post-discount amount? Affects how `discount_percentage` is converted to a savings dollar amount on the Savings page. (See SPEC §6.4.)
- [ ] Editing UI (deferred — read-only for now per CLAUDE.md).

## Notes / gotchas

- DB is at the path in `config.py`. Don't hardcode it elsewhere.
- Disbursements with `refunded_from_receipt = NULL` exist and must NOT subtract from any receipt's `actual_price`.
- Discounts on receipts can be either `discount` (flat) or `discount_percentage` (percent) — both can be 0; "has discount" means either is non-zero.
