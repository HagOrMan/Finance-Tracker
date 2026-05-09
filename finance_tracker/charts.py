"""Shared chart-building functions using Plotly."""

from __future__ import annotations

import pandas as pd
import plotly.graph_objects as go


def daily_stacked_bar(
    df: pd.DataFrame,
    price_col: str,
    color_map: dict[str, str],
    y_label: str = "Amount ($)",
) -> go.Figure:
    """Stacked bar chart: one bar per date, segments per receipt colored by category."""
    df = df.copy()
    df["date_str"] = df["date"].dt.strftime("%Y-%m-%d")

    dates = sorted(df["date_str"].unique())
    fig = go.Figure()

    categories_present = df["category"].unique()
    added_to_legend: set[str] = set()

    for _, row in df.sort_values(["date_str", "category"]).iterrows():
        cat = row["category"]
        show_legend = cat not in added_to_legend
        added_to_legend.add(cat)

        note_text = (
            f"<br>Note: {row['note']}"
            if pd.notna(row.get("note")) and row.get("note")
            else ""
        )
        fig.add_trace(
            go.Bar(
                x=[row["date_str"]],
                y=[row[price_col]],
                name=cat,
                marker_color=color_map.get(cat, "#888"),
                legendgroup=cat,
                showlegend=show_legend,
                hovertemplate=(
                    f"<b>{row['store']}</b><br>"
                    f"Category: {cat}<br>"
                    f"Amount: ${row[price_col]:.2f}{note_text}"
                    "<extra></extra>"
                ),
            )
        )

    fig.update_layout(
        barmode="stack",
        xaxis_title="Date",
        yaxis_title=y_label,
        xaxis={"categoryorder": "array", "categoryarray": dates},
        legend_title="Category",
        hovermode="closest",
        margin={"t": 30},
    )
    return fig


def category_pie(
    df: pd.DataFrame,
    price_col: str,
    color_map: dict[str, str],
    mode: str = "Sum",
) -> go.Figure:
    if mode == "Sum":
        by_cat = df.groupby("category")[price_col].sum()
    else:
        by_cat = df.groupby("category")[price_col].mean()

    colors = [color_map.get(c, "#888") for c in by_cat.index]
    fig = go.Figure(
        go.Pie(
            labels=by_cat.index.tolist(),
            values=by_cat.values.tolist(),
            marker_colors=colors,
            textinfo="label+value+percent",
            hovertemplate="<b>%{label}</b><br>%{value:.2f}<br>%{percent}<extra></extra>",
        )
    )
    fig.update_layout(margin={"t": 30})
    return fig


def spend_per_day_bar(
    df: pd.DataFrame,
    price_col: str,
    y_label: str = "Amount ($)",
) -> go.Figure:
    by_day = (
        df.groupby(df["date"].dt.date)[price_col]
        .sum()
        .reset_index()
        .rename(columns={"date": "date_str", price_col: "amount"})
    )
    by_day["date_str"] = by_day["date_str"].astype(str)

    fig = go.Figure(
        go.Bar(
            x=by_day["date_str"],
            y=by_day["amount"],
            marker_color="#4C78A8",
            hovertemplate="Date: %{x}<br>Amount: $%{y:.2f}<extra></extra>",
        )
    )
    fig.update_layout(
        xaxis_title="Date",
        yaxis_title=y_label,
        margin={"t": 30},
    )
    return fig


def savings_over_time(
    df: pd.DataFrame,
    savings_col: str = "total_savings",
    date_range_days: int = 30,
) -> go.Figure:
    freq = "D" if date_range_days <= 60 else "W"
    by_period = df.set_index("date")[savings_col].resample(freq).sum().reset_index()
    by_period["date_str"] = by_period["date"].dt.strftime("%Y-%m-%d")

    fig = go.Figure(
        go.Bar(
            x=by_period["date_str"],
            y=by_period[savings_col],
            marker_color="#54A24B",
            hovertemplate="Date: %{x}<br>Savings: $%{y:.2f}<extra></extra>",
        )
    )
    fig.update_layout(
        xaxis_title="Date",
        yaxis_title="Savings ($)",
        margin={"t": 30},
    )
    return fig


def savings_by_category_bar(
    df: pd.DataFrame,
    savings_col: str,
    color_map: dict[str, str],
) -> go.Figure:
    by_cat = df.groupby("category")[savings_col].sum().reset_index()
    colors = [color_map.get(c, "#888") for c in by_cat["category"]]

    fig = go.Figure(
        go.Bar(
            x=by_cat["category"],
            y=by_cat[savings_col],
            marker_color=colors,
            hovertemplate="<b>%{x}</b><br>Savings: $%{y:.2f}<extra></extra>",
        )
    )
    fig.update_layout(
        xaxis_title="Category",
        yaxis_title="Savings ($)",
        margin={"t": 30},
    )
    return fig


def cumulative_spend_with_extrapolation(
    df: pd.DataFrame,
    price_col: str,
    forward_days: int = 30,
) -> go.Figure:
    import numpy as np
    from datetime import timedelta

    by_day = (
        df.groupby(df["date"].dt.date)[price_col]
        .sum()
        .reset_index()
        .rename(columns={"date": "day", price_col: "amount"})
        .sort_values("day")
    )
    by_day["cumulative"] = by_day["amount"].cumsum()

    avg_per_day = by_day["amount"].mean()
    last_day = by_day["day"].max()
    last_cum = by_day["cumulative"].max()

    future_days = [last_day + timedelta(days=i + 1) for i in range(forward_days)]
    future_cum = [last_cum + avg_per_day * (i + 1) for i in range(forward_days)]

    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=by_day["day"].astype(str),
            y=by_day["cumulative"],
            mode="lines+markers",
            name="Actual",
            line_color="#4C78A8",
            hovertemplate="Date: %{x}<br>Cumulative: $%{y:.2f}<extra></extra>",
        )
    )
    fig.add_trace(
        go.Scatter(
            x=[str(d) for d in [last_day] + future_days],
            y=[last_cum] + future_cum,
            mode="lines",
            name="Extrapolation",
            line={"dash": "dash", "color": "#E45756"},
            hovertemplate="Date: %{x}<br>Projected: $%{y:.2f}<extra></extra>",
        )
    )
    fig.update_layout(
        xaxis_title="Date",
        yaxis_title="Cumulative spend ($)",
        margin={"t": 30},
    )
    return fig
