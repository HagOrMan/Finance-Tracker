"""Data access layer. All DB reads go here — no inline sqlite3 calls in pages."""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path

import pandas as pd
import streamlit as st

import config


class DBError(RuntimeError):
    pass


def _db_mtime() -> float:
    path = Path(config.DB_PATH)
    if not path.exists():
        raise DBError(f"Database not found: {config.DB_PATH}")
    return os.path.getmtime(path)


def get_connection(readonly: bool = True) -> sqlite3.Connection:
    """Return a DB connection. readonly=True for now; flip to False when editing is added."""
    uri = Path(config.DB_PATH).as_uri()
    if readonly:
        uri += "?mode=ro"
    return sqlite3.connect(uri, uri=True)


@st.cache_data
def load_receipts(_mtime: float) -> pd.DataFrame:
    try:
        with get_connection() as conn:
            df = pd.read_sql(
                "SELECT * FROM receipts",
                conn,
                parse_dates=["date"],
            )
    except Exception as exc:
        raise DBError(f"Failed to read receipts: {exc}") from exc
    df["discount"] = df["discount"].fillna(0)
    df["discount_percentage"] = df["discount_percentage"].fillna(0)
    return df.copy()


@st.cache_data
def load_disbursements(_mtime: float) -> pd.DataFrame:
    try:
        with get_connection() as conn:
            df = pd.read_sql(
                "SELECT * FROM disbursements",
                conn,
                parse_dates=["date_received"],
            )
    except Exception as exc:
        raise DBError(f"Failed to read disbursements: {exc}") from exc
    return df.copy()


@st.cache_data
def load_merged_receipts(_mtime: float) -> pd.DataFrame:
    receipts = load_receipts(_mtime)
    disbursements = load_disbursements(_mtime)

    refunds = (
        disbursements[disbursements["refunded_from_receipt"].notna()]
        .groupby("refunded_from_receipt")["amount"]
        .sum()
    )

    df = (
        receipts.merge(refunds, how="left", left_on="id", right_index=True)
        .rename(columns={"amount": "total_refunded"})
        .assign(total_refunded=lambda d: d["total_refunded"].fillna(0))
        .assign(actual_price=lambda d: d["price"] - d["total_refunded"])
    )
    return df.copy()


def get_mtime() -> float:
    """Call this in pages to get the cache key, handling the missing-DB case."""
    return _db_mtime()
