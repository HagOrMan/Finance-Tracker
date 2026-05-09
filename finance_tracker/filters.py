"""Filter bar component and filter application logic."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

import pandas as pd
import streamlit as st

import config


@dataclass
class Filters:
    start_date: date
    end_date: date
    categories: list[str] = field(default_factory=list)
    stores: list[str] = field(default_factory=list)
    entities: list[str] = field(default_factory=list)
    has_discount: str = "Any"
    subtract_refunds: bool = True


def _init_defaults() -> None:
    today = date.today()
    defaults = {
        "filter_start_date": today - timedelta(days=config.DEFAULT_DATE_RANGE_DAYS - 1),
        "filter_end_date": today,
        "filter_categories": [],
        "filter_stores": [],
        "filter_entities": [],
        "filter_has_discount": "Any",
        "filter_subtract_refunds": config.DEFAULT_SUBTRACT_REFUNDS,
    }
    for key, val in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = val


def render_filter_bar(
    df_receipts: pd.DataFrame,
    df_disbursements: pd.DataFrame | None = None,
    show_entity_filter: bool = False,
) -> Filters:
    """Render the horizontal filter bar and return the current Filters state."""
    _init_defaults()

    all_categories = sorted(df_receipts["category"].dropna().unique().tolist())
    all_stores = sorted(df_receipts["store"].dropna().unique().tolist())

    col_count = 6 if show_entity_filter else 5
    cols = st.columns([2, 2, 2, 2, 1.5, 1] if show_entity_filter else [2, 2, 2, 1.5, 1])

    with cols[0]:
        date_range = st.date_input(
            "Date range",
            value=(st.session_state["filter_start_date"], st.session_state["filter_end_date"]),
            key="_date_input",
        )
        if isinstance(date_range, (list, tuple)) and len(date_range) == 2:
            st.session_state["filter_start_date"] = date_range[0]
            st.session_state["filter_end_date"] = date_range[1]

    with cols[1]:
        st.session_state["filter_categories"] = st.multiselect(
            "Category",
            options=all_categories,
            default=st.session_state["filter_categories"],
            key="_cat_select",
        )

    with cols[2]:
        st.session_state["filter_stores"] = st.multiselect(
            "Store",
            options=all_stores,
            default=st.session_state["filter_stores"],
            key="_store_select",
        )

    entity_col_idx = 3
    discount_col_idx = 4 if show_entity_filter else 3
    refresh_col_idx = 5 if show_entity_filter else 4

    if show_entity_filter and df_disbursements is not None:
        all_entities = sorted(df_disbursements["entity"].dropna().unique().tolist())
        with cols[entity_col_idx]:
            st.session_state["filter_entities"] = st.multiselect(
                "Entity",
                options=all_entities,
                default=st.session_state["filter_entities"],
                key="_entity_select",
            )

    with cols[discount_col_idx]:
        st.session_state["filter_has_discount"] = st.selectbox(
            "Has discount",
            options=["Any", "Yes", "No"],
            index=["Any", "Yes", "No"].index(st.session_state["filter_has_discount"]),
            key="_discount_select",
        )

    with cols[refresh_col_idx]:
        st.session_state["filter_subtract_refunds"] = st.checkbox(
            "Net paid",
            value=st.session_state["filter_subtract_refunds"],
            key="_net_paid",
            help="Subtract refunds from price",
        )
        if st.button("🔄 Refresh", key="_refresh_btn"):
            st.cache_data.clear()
            st.rerun()

    return Filters(
        start_date=st.session_state["filter_start_date"],
        end_date=st.session_state["filter_end_date"],
        categories=st.session_state["filter_categories"],
        stores=st.session_state["filter_stores"],
        entities=st.session_state["filter_entities"],
        has_discount=st.session_state["filter_has_discount"],
        subtract_refunds=st.session_state["filter_subtract_refunds"],
    )


def apply_filters(df: pd.DataFrame, filters: Filters) -> pd.DataFrame:
    """Apply date/category/store/discount filters to a receipts DataFrame."""
    df = df.copy()

    mask = (
        (df["date"].dt.date >= filters.start_date)
        & (df["date"].dt.date <= filters.end_date)
    )
    df = df[mask]

    if filters.categories:
        df = df[df["category"].isin(filters.categories)]

    if filters.stores:
        df = df[df["store"].isin(filters.stores)]

    if filters.has_discount == "Yes":
        df = df[(df["discount"] > 0) | (df["discount_percentage"] > 0)]
    elif filters.has_discount == "No":
        df = df[(df["discount"] == 0) & (df["discount_percentage"] == 0)]

    return df


def price_col(filters: Filters) -> str:
    """Return the column name to use for price based on net-paid toggle."""
    return "actual_price" if filters.subtract_refunds else "price"


def price_label(filters: Filters) -> str:
    return "Net paid ($)" if filters.subtract_refunds else "Gross paid ($)"
