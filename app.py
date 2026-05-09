"""Overview page — Streamlit entry point."""

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
    page_title=config.APP_TITLE, page_icon=config.APP_ICON, layout="wide"
)
st.title(f"{config.APP_ICON} {config.APP_TITLE} — Overview")

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

# --- KPIs ---
total_spend = df[pcol].sum()
num_receipts = len(df)
date_range_days = (filters.end_date - filters.start_date).days + 1
avg_per_day = total_spend / date_range_days if date_range_days > 0 else 0
total_refunded = df["total_refunded"].sum()

k1, k2, k3, k4 = st.columns(4)
k1.metric("Total spend", f"${total_spend:,.2f}")
k2.metric("Receipts", num_receipts)
k3.metric("Avg / day", f"${avg_per_day:,.2f}")
k4.metric("Total refunded", f"${total_refunded:,.2f}")

st.divider()

# --- Mini daily bar chart ---
st.subheader("Spend per day")
fig = charts.spend_per_day_bar(df, pcol, y_label=plabel)
st.plotly_chart(fig, width="stretch")

st.divider()

# --- Recent receipts table ---
st.subheader("Recent receipts")
display_cols = [
    "date",
    "store",
    "category",
    "price",
    "total_refunded",
    "actual_price",
    "note",
]
recent = df.sort_values("date", ascending=False).head(10)[display_cols].copy()
recent["date"] = recent["date"].dt.strftime("%Y-%m-%d")
st.dataframe(recent, width="stretch")
