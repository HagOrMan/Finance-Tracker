"""Daily breakdown page."""

import streamlit as st

import config
from finance_tracker.colors import get_category_colors
from finance_tracker.data import DBError, get_mtime, load_merged_receipts
from finance_tracker.filters import apply_filters, price_col, price_label, render_filter_bar
from finance_tracker import charts

st.set_page_config(page_title="Daily | " + config.APP_TITLE, page_icon=config.APP_ICON, layout="wide")
st.title("📅 Daily Breakdown")

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

st.subheader("Spend by day and category")
fig = charts.daily_stacked_bar(df, pcol, color_map, y_label=plabel)
st.plotly_chart(fig, use_container_width=True)

st.divider()
st.subheader("Receipts")
display_cols = ["date", "store", "category", "price", "total_refunded", "actual_price", "discount", "discount_percentage", "note"]
table = df.sort_values("date", ascending=False)[display_cols].copy()
table["date"] = table["date"].dt.strftime("%Y-%m-%d")
st.dataframe(table, use_container_width=True)
