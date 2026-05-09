"""Savings & extrapolation page."""

import pandas as pd
import streamlit as st

import config
from finance_tracker.colors import get_category_colors
from finance_tracker.data import DBError, get_mtime, load_merged_receipts
from finance_tracker.filters import apply_filters, price_col, price_label, render_filter_bar
from finance_tracker import charts

st.set_page_config(page_title="Savings | " + config.APP_TITLE, page_icon=config.APP_ICON, layout="wide")
st.title("💰 Savings & Extrapolation")

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

# --- Savings calculation ---
# price in the DB is post-discount: price = (original - discount) * (1 - pct/100)
# So: savings from flat discount = discount
#     savings from pct discount  = price * pct / (100 - pct)   [when pct < 100]
def compute_savings(row: pd.Series) -> float:
    flat = row.get("discount", 0) or 0
    pct = row.get("discount_percentage", 0) or 0
    pct_savings = row["price"] * pct / (100 - pct) if pct < 100 else row["price"]
    return flat + pct_savings

df = df.copy()
df["total_savings"] = df.apply(compute_savings, axis=1)

total_savings = df["total_savings"].sum()
total_spend = df[pcol].sum()
num_receipts_with_discount = ((df["discount"] > 0) | (df["discount_percentage"] > 0)).sum()
date_range_days = (filters.end_date - filters.start_date).days + 1

# --- KPIs ---
k1, k2, k3 = st.columns(3)
k1.metric("Total savings", f"${total_savings:,.2f}")
k2.metric("Receipts with discount", num_receipts_with_discount)
k3.metric("Savings rate", f"{(total_savings / (total_spend + total_savings) * 100):.1f}%" if (total_spend + total_savings) > 0 else "—")

st.divider()

# --- Savings over time ---
st.subheader("Savings over time")
fig = charts.savings_over_time(df, savings_col="total_savings", date_range_days=date_range_days)
st.plotly_chart(fig, use_container_width=True)

# --- Savings by category ---
st.subheader("Savings by category")
fig2 = charts.savings_by_category_bar(df, "total_savings", color_map)
st.plotly_chart(fig2, use_container_width=True)

st.divider()

# --- Spend extrapolation ---
st.subheader("Spend extrapolation")
avg_per_day = total_spend / date_range_days if date_range_days > 0 else 0
proj = pd.DataFrame({
    "Period": ["Day", "Week", "Month (30 days)"],
    f"Projected spend ({plabel})": [
        f"${avg_per_day:,.2f}",
        f"${avg_per_day * 7:,.2f}",
        f"${avg_per_day * 30:,.2f}",
    ],
})
st.table(proj)

fig3 = charts.cumulative_spend_with_extrapolation(df, pcol, forward_days=config.EXTRAPOLATION_FORWARD_DAYS)
st.plotly_chart(fig3, use_container_width=True)
