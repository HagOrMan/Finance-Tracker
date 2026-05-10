"""Disbursements page — money received (refunds and standalone income)."""

from __future__ import annotations

from datetime import date, timedelta

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

import config
from finance_tracker.colors import get_category_colors
from finance_tracker.data import (
    DBError,
    get_mtime,
    load_disbursements,
    load_merged_receipts,
)
from finance_tracker.filters import _init_defaults, Filters

st.set_page_config(
    page_title="Disbursements | " + config.APP_TITLE,
    page_icon=config.APP_ICON,
    layout="wide",
)
st.title("📥 Disbursements")

try:
    mtime = get_mtime()
except DBError as e:
    st.error(str(e))
    st.stop()

df_disb = load_disbursements(mtime)
df_receipts = load_merged_receipts(mtime)

# --- Filter bar (disbursement-specific) ---
_init_defaults()

all_entities = sorted(df_disb["entity"].dropna().unique().tolist())

cols = st.columns([2, 2, 1])

with cols[0]:
    date_range = st.date_input(
        "Date range",
        value=(
            st.session_state["filter_start_date"],
            st.session_state["filter_end_date"],
        ),
        key="_date_input",
    )
    if isinstance(date_range, (list, tuple)) and len(date_range) == 2:
        st.session_state["filter_start_date"] = date_range[0]
        st.session_state["filter_end_date"] = date_range[1]

with cols[1]:
    st.session_state["filter_entities"] = st.multiselect(
        "Entity",
        options=all_entities,
        default=st.session_state["filter_entities"],
        key="_entity_select",
    )

with cols[2]:
    if st.button("🔄 Refresh", key="_refresh_btn"):
        st.cache_data.clear()
        st.rerun()

start_date: date = st.session_state["filter_start_date"]
end_date: date = st.session_state["filter_end_date"]
selected_entities: list[str] = st.session_state["filter_entities"]

# --- Apply filters ---
df = df_disb.copy()
df = df[
    (df["date_received"].dt.date >= start_date)
    & (df["date_received"].dt.date <= end_date)
]
if selected_entities:
    df = df[df["entity"].isin(selected_entities)]

if df.empty:
    st.info("No disbursements match the current filters.")
    st.stop()

# --- Classify: linked (refund) vs standalone ---
df["is_refund"] = df["refunded_from_receipt"].notna()

# --- KPIs ---
total_received = df["amount"].sum()
total_refunds = df.loc[df["is_refund"], "amount"].sum()
total_standalone = df.loc[~df["is_refund"], "amount"].sum()
num_entries = len(df)

k1, k2, k3, k4 = st.columns(4)
k1.metric("Total received", f"${total_received:,.2f}")
k2.metric("Refunds (linked)", f"${total_refunds:,.2f}")
k3.metric("Standalone income", f"${total_standalone:,.2f}")
k4.metric("Entries", num_entries)

st.divider()

# --- Amount over time ---
st.subheader("Disbursements over time")

date_range_days = (end_date - start_date).days + 1
freq = "D" if date_range_days <= 60 else "W"

by_period = df.set_index("date_received")["amount"].resample(freq).sum().reset_index()
by_period["date_str"] = by_period["date_received"].dt.strftime("%Y-%m-%d")

fig_time = go.Figure(
    go.Bar(
        x=by_period["date_str"],
        y=by_period["amount"],
        marker_color="#F58518",
        hovertemplate="Date: %{x}<br>Amount: $%{y:.2f}<extra></extra>",
    )
)
fig_time.update_layout(
    xaxis_title="Date",
    yaxis_title="Amount ($)",
    margin={"t": 30},
)
st.plotly_chart(fig_time, width="stretch")

# --- By entity ---
st.subheader("By entity")

by_entity = (
    df.groupby("entity")["amount"]
    .sum()
    .reset_index()
    .sort_values("amount", ascending=False)
)

fig_entity = go.Figure(
    go.Bar(
        x=by_entity["entity"],
        y=by_entity["amount"],
        marker_color="#4C78A8",
        hovertemplate="<b>%{x}</b><br>Total: $%{y:.2f}<extra></extra>",
    )
)
fig_entity.update_layout(
    xaxis_title="Entity",
    yaxis_title="Amount ($)",
    margin={"t": 30},
)
st.plotly_chart(fig_entity, width="stretch")

st.divider()

# --- Table ---
st.subheader("All disbursements")

# Enrich with receipt info for linked refunds
linked = df[df["is_refund"]].copy()
if not linked.empty:
    receipt_lookup = df_receipts[["id", "store", "category"]].rename(
        columns={
            "id": "refunded_from_receipt",
            "store": "receipt_store",
            "category": "receipt_category",
        }
    )
    linked = linked.merge(receipt_lookup, on="refunded_from_receipt", how="left")
    df = df.merge(
        linked[["id", "receipt_store", "receipt_category"]],
        on="id",
        how="left",
    )

tbl_entities = sorted(df["entity"].dropna().unique().tolist())
tbl_stores = sorted(df["receipt_store"].dropna().unique().tolist()) if "receipt_store" in df.columns else []
tbl_categories = sorted(df["receipt_category"].dropna().unique().tolist()) if "receipt_category" in df.columns else []

tc1, tc2, tc3 = st.columns([2, 1.5, 3])
with tc1:
    sel_entities = st.multiselect("Filter by entity", tbl_entities, key="tbl_db_entity")
with tc2:
    sel_type = st.selectbox("Type", ["All", "Refund", "Standalone"], key="tbl_db_type")
with tc3:
    reason_search = st.text_input(
        "Search reason", key="tbl_db_reason", placeholder="type to search…"
    )

if tbl_stores or tbl_categories:
    tc4, tc5 = st.columns(2)
    with tc4:
        sel_stores = st.multiselect("Filter by linked store", tbl_stores, key="tbl_db_store")
    with tc5:
        sel_categories = st.multiselect("Filter by linked category", tbl_categories, key="tbl_db_category")
else:
    sel_stores = []
    sel_categories = []

display = df.copy()
if sel_entities:
    display = display[display["entity"].isin(sel_entities)]
if sel_type == "Refund":
    display = display[display["is_refund"]]
elif sel_type == "Standalone":
    display = display[~display["is_refund"]]
if reason_search:
    display = display[
        display["reason"].fillna("").str.contains(reason_search, case=False, na=False)
    ]
if sel_stores:
    display = display[display["receipt_store"].isin(sel_stores)]
if sel_categories:
    display = display[display["receipt_category"].isin(sel_categories)]

display["date_received"] = display["date_received"].dt.strftime("%Y-%m-%d")
display["type"] = display["is_refund"].map({True: "Refund", False: "Standalone"})

cols_order = ["date_received", "entity", "amount", "type", "reason"]
if "receipt_store" in display.columns:
    cols_order += ["receipt_store", "receipt_category"]

st.dataframe(
    display[cols_order].sort_values("date_received", ascending=False),
    width="stretch",
    hide_index=True,
    column_config={
        "date_received": "Date",
        "entity": "Entity",
        "amount": st.column_config.NumberColumn("Amount ($)", format="$%.2f"),
        "type": "Type",
        "reason": "Reason",
        "receipt_store": "Linked store",
        "receipt_category": "Linked category",
    },
)
