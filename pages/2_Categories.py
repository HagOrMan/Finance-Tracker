"""Categories page."""

import pandas as pd
import streamlit as st

import config
from finance_tracker.colors import get_category_colors
from finance_tracker.data import DBError, get_mtime, load_merged_receipts
from finance_tracker.filters import (
    apply_filters,
    price_col,
    price_label,
    render_filter_bar,
)
from finance_tracker import charts

st.set_page_config(
    page_title="Categories | " + config.APP_TITLE,
    page_icon=config.APP_ICON,
    layout="wide",
)
st.title("🗂️ Categories")

try:
    mtime = get_mtime()
except DBError as e:
    st.error(str(e))
    st.stop()

df_all = load_merged_receipts(mtime)
filters = render_filter_bar(df_all)
df = apply_filters(df_all, filters)

if df.empty:
    st.info("No receipts match the current filters.")
    st.stop()

pcol = price_col(filters)
plabel = price_label(filters)
color_map = get_category_colors(tuple(sorted(df_all["category"].dropna().unique())))

mode = st.radio("Chart mode", ["Sum", "Mean"], horizontal=True)

fig = charts.category_pie(df, pcol, color_map, mode=mode)
st.plotly_chart(fig, width="stretch")

st.divider()
st.subheader("Summary by category")

tbl_cats = sorted(df["category"].dropna().unique().tolist())
tc1, tc2 = st.columns([3, 4])
with tc1:
    sel_cats = st.multiselect("Filter by category", tbl_cats, key="tbl_ct_cat")
with tc2:
    store_opts = sorted(df["store"].dropna().unique().tolist())
    sel_stores = st.multiselect(
        "Filter by store (affects totals)", store_opts, key="tbl_ct_store"
    )

tbl_df = df.copy()
if sel_cats:
    tbl_df = tbl_df[tbl_df["category"].isin(sel_cats)]
if sel_stores:
    tbl_df = tbl_df[tbl_df["store"].isin(sel_stores)]

total_all = tbl_df[pcol].sum()
summary = (
    tbl_df.groupby("category")[pcol]
    .agg(total="sum", mean="mean", count="count")
    .reset_index()
)
summary["% of total"] = (
    (summary["total"] / total_all * 100).round(1) if total_all > 0 else 0
)
summary = summary.sort_values("total", ascending=False)
summary.columns = [
    "Category",
    f"Total ({plabel})",
    f"Mean ({plabel})",
    "Count",
    "% of total",
]
st.dataframe(summary, width="stretch", hide_index=True)
