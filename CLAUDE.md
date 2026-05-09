# CLAUDE.md

This file is the entry point for Claude Code. Read this first, every session, before doing anything else.

## What this project is

A personal finance tracker built as a **Streamlit app**. It reads from a local SQLite database containing two tables — `receipts` (money paid out) and `disbursements` (money received back, often as refunds for group purchases). The app is a more-customized alternative to a spreadsheet for visualizing spend.

This is a **standalone repo**, separate from the database's source repo. The DB path is configured in `config.py`.

## How to work in this repo

1. **Always read `PROGRESS.md` first.** It tracks what has been built, what is in progress, and what is next. Update it as you go — when you finish a unit of work, mark it done; when you start something new, note it.
2. **Read `SPEC.md` only when you need to.** It is the full specification. Once you've read it once and the high-level structure is clear from `PROGRESS.md`, you do not need to re-read all of it every session — only the section relevant to your current task. Section anchors are listed at the top of `SPEC.md`.
3. **Treat `config.py` as user-owned.** Do not change its values (paths, defaults) without being asked. You may add new config keys when the spec calls for them, but flag the addition in `PROGRESS.md`.
4. **Ask before deviating from the spec.** If something in `SPEC.md` is ambiguous or you think a different approach would be better, ask the user before implementing it. Small judgement calls (variable names, helper extraction, file organization within the agreed structure) are fine to make on your own.
5. **Keep changes scoped.** Don't refactor unrelated code while implementing a feature. If you notice something worth changing elsewhere, note it in `PROGRESS.md` under "Follow-ups" rather than doing it inline.

## Tech stack (decided)

- **Python** + **Streamlit** for the UI.
- **pandas** for data manipulation.
- **SQLite** via `sqlite3` (stdlib) or `pandas.read_sql`. Read-only for now.
- **Plotting library: your call.** Pick whichever best fits the requirements in `SPEC.md` — in particular, the daily breakdown chart needs hover tooltips showing category + amount per segment, and the legend's category-to-color mapping must stay consistent across all charts on all pages. Plotly and Altair both handle this well; matplotlib does not have native hover. Document the choice in `PROGRESS.md` once made and stick with it across the whole app.

## Project layout (suggested, adjust if needed)

```
finance_tracker/
├── CLAUDE.md           # this file
├── SPEC.md             # full specification
├── PROGRESS.md         # rolling progress log
├── config.py           # user-owned config (DB path, defaults)
├── example_config.py   # example config (mimics user config, hiding information so it can be pushed to git)
├── requirements.txt
├── app.py              # Streamlit entry point (Overview / landing page)
├── pages/              # Streamlit multi-page directory
│   ├── 1_Daily.py
│   ├── 2_Categories.py
│   └── 3_Savings.py
└── finance_tracker/    # importable package for shared logic
    ├── __init__.py
    ├── data.py         # DB access, caching, the receipts+disbursements join
    ├── filters.py      # filter UI component + filter application logic
    ├── colors.py       # category→color map generation
    └── charts.py       # plotting functions
```

If your chosen plotting library or feature scope makes a different layout cleaner, propose it in `PROGRESS.md` before reorganizing.

## Hard rules

- **Read-only DB access.** No writes, no schema changes. The app must never mutate `secret_finances.db`. Design data-access functions so an editing layer could be added later, but do not implement editing now.
- **DB path comes from `config.py`, never hardcoded elsewhere.** If the path is missing or invalid, show a clear error in the app instead of crashing.
- **Cache reads with `@st.cache_data`** and provide a visible **Refresh** button that clears the cache. The DB is small, so caching is for snappiness, not scale.
- **The category→color mapping is generated once from the DB's distinct categories at startup**, then passed to every chart. Same category = same color, everywhere, every page.
- **Filters live in a horizontal bar at the top of each page**, not in the sidebar. They should be shared across pages where it makes sense (see `SPEC.md` for which filters apply where).
- **Default date range on load is the last 30 days.**
- **The "actual price" / net-paid logic** (receipts left-joined with summed disbursements, refunds subtracted) is the canonical view. There must be a checkbox — **default checked** — to toggle this on/off. When unchecked, charts show gross `price`; when checked, they show `actual_price`.

## When you finish a task

1. Update `PROGRESS.md`: move the item from "In progress" to "Done", add a one-line note about anything notable (a decision made, a deviation from spec, a follow-up needed).
2. If you added a new dependency, update `requirements.txt`.
3. If you added a new config key, update `config.py` with a sensible default and document it in `PROGRESS.md`.
4. Briefly summarize what changed in your reply to the user — don't dump the full diff, just what's now possible that wasn't before.
