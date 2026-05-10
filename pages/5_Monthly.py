"""Monthly breakdown page."""

import streamlit as st

import config
from finance_tracker import charts
from finance_tracker.colors import get_category_colors
from finance_tracker.data import DBError, get_mtime, load_merged_receipts

st.set_page_config(
    page_title="Monthly | " + config.APP_TITLE,
    page_icon=config.APP_ICON,
    layout="wide",
)
st.title("📆 Monthly Breakdown")

try:
    mtime = get_mtime()
except DBError as e:
    st.error(str(e))
    st.stop()

df_all = load_merged_receipts(mtime)
color_map = get_category_colors(tuple(sorted(df_all["category"].dropna().unique())))

# --- Shared session state defaults (same keys as filters.py for cross-page persistence) ---
for key, default in [
    ("filter_categories", []),
    ("filter_stores", []),
    ("filter_has_discount", "Any"),
    ("filter_subtract_refunds", config.DEFAULT_SUBTRACT_REFUNDS),
]:
    if key not in st.session_state:
        st.session_state[key] = default

# Available months, most-recent first in the picker, default = last 6
all_months_desc = sorted(
    df_all["date"].dt.to_period("M").astype(str).unique().tolist(),
    reverse=True,
)
if "monthly_selected_months" not in st.session_state:
    st.session_state["monthly_selected_months"] = all_months_desc[:6]

# --- Filter bar ---
c1, c2, c3, c4, c5 = st.columns([3, 2, 2, 1.5, 1])
with c1:
    st.session_state["monthly_selected_months"] = st.multiselect(
        "Months (any, non-consecutive ok)",
        options=all_months_desc,
        default=st.session_state["monthly_selected_months"],
        key="_monthly_months",
    )
with c2:
    st.session_state["filter_categories"] = st.multiselect(
        "Category",
        options=sorted(df_all["category"].dropna().unique().tolist()),
        default=st.session_state["filter_categories"],
        key="_cat_select",
    )
with c3:
    st.session_state["filter_stores"] = st.multiselect(
        "Store",
        options=sorted(df_all["store"].dropna().unique().tolist()),
        default=st.session_state["filter_stores"],
        key="_store_select",
    )
with c4:
    st.session_state["filter_has_discount"] = st.selectbox(
        "Has discount",
        options=["Any", "Yes", "No"],
        index=["Any", "Yes", "No"].index(st.session_state["filter_has_discount"]),
        key="_discount_select",
    )
with c5:
    st.session_state["filter_subtract_refunds"] = st.checkbox(
        "Net paid",
        value=st.session_state["filter_subtract_refunds"],
        key="_net_paid",
        help="Subtract refunds from price",
    )
    if st.button("🔄 Refresh", key="_refresh_btn"):
        st.cache_data.clear()
        st.rerun()

selected_months = st.session_state["monthly_selected_months"]
if not selected_months:
    st.info("Select at least one month above to view data.")
    st.stop()

months_chrono = sorted(selected_months)

# --- Apply filters ---
df = df_all.copy()
df["month_str"] = df["date"].dt.to_period("M").astype(str)
df = df[df["month_str"].isin(selected_months)]

if st.session_state["filter_categories"]:
    df = df[df["category"].isin(st.session_state["filter_categories"])]
if st.session_state["filter_stores"]:
    df = df[df["store"].isin(st.session_state["filter_stores"])]

discount_filter = st.session_state["filter_has_discount"]
if discount_filter == "Yes":
    df = df[(df["discount"] > 0) | (df["discount_percentage"] > 0)]
elif discount_filter == "No":
    df = df[(df["discount"] == 0) & (df["discount_percentage"] == 0)]

subtract_refunds = st.session_state["filter_subtract_refunds"]
pcol = "actual_price" if subtract_refunds else "price"
plabel = "Net paid ($)" if subtract_refunds else "Gross paid ($)"

if df.empty:
    st.info("No receipts match the current filters.")
    st.stop()

# --- KPIs ---
total_spend = df[pcol].sum()
avg_per_month = total_spend / len(selected_months)
num_receipts = len(df)
total_refunded = df["total_refunded"].sum()

k1, k2, k3, k4 = st.columns(4)
k1.metric("Total spend", f"${total_spend:,.2f}")
k2.metric("Avg / month", f"${avg_per_month:,.2f}")
k3.metric("Receipts", str(num_receipts))
k4.metric("Total refunded", f"${total_refunded:,.2f}")

# --- Section 1: Stacked bar by month ---
st.divider()
st.subheader("Spend by month and category")
fig_bar = charts.monthly_stacked_bar(df, pcol, color_map, months_chrono, y_label=plabel)
st.plotly_chart(fig_bar, width="stretch")

# --- Section 2: Receipts by month (tabs) ---
st.divider()
st.subheader("Receipts by month")

display_cols = [
    "date", "store", "category", "price",
    "total_refunded", "actual_price",
    "discount", "discount_percentage", "note",
]
tab_months = [m for m in months_chrono if m in df["month_str"].values]
if tab_months:
    tabs = st.tabs([f"📋 {m}" for m in tab_months])
    for tab, month in zip(tabs, tab_months):
        with tab:
            month_df = df[df["month_str"] == month][display_cols].copy()
            month_df["date"] = month_df["date"].dt.strftime("%Y-%m-%d")
            month_total = month_df[pcol].sum()
            st.caption(f"Total: **${month_total:,.2f}** — {len(month_df)} receipts")
            st.dataframe(
                month_df.sort_values("date", ascending=False),
                width="stretch",
                hide_index=True,
            )

# --- Section 3: Category trends ---
st.divider()
st.subheader("Category trends over months")
st.caption(
    "Line chart shows spend per category per month. "
    "Heatmap highlights relative intensity — darker = higher spend."
)

trend_cats = sorted(df["category"].dropna().unique().tolist())
sel_trend_cats = st.multiselect(
    "Filter categories (leave empty for all)",
    options=trend_cats,
    key="trend_cat_filter",
)
df_trend = df.copy()
if sel_trend_cats:
    df_trend = df_trend[df_trend["category"].isin(sel_trend_cats)]

if df_trend.empty:
    st.info("No data for selected categories.")
else:
    fig_line = charts.monthly_category_line(
        df_trend, pcol, color_map, months_chrono, y_label=plabel
    )
    st.plotly_chart(fig_line, width="stretch")

    st.subheader("Category × month heatmap")
    fig_heat = charts.monthly_category_heatmap(df_trend, pcol, months_chrono, y_label=plabel)
    st.plotly_chart(fig_heat, width="stretch")
