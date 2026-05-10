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
    avg_per_day: float | None = None,
) -> go.Figure:
    from datetime import timedelta

    by_day = (
        df.groupby(df["date"].dt.date)[price_col]
        .sum()
        .reset_index()
        .rename(columns={"date": "day", price_col: "amount"})
        .sort_values("day")
    )
    by_day["cumulative"] = by_day["amount"].cumsum()

    if avg_per_day is None:
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


def monthly_stacked_bar(
    df: pd.DataFrame,
    price_col: str,
    color_map: dict[str, str],
    months: list[str],
    y_label: str = "Amount ($)",
) -> go.Figure:
    """Stacked bar chart: one bar per month, segments aggregated by category."""
    df = df.copy()
    df["month_str"] = df["date"].dt.to_period("M").astype(str)
    agg = df.groupby(["month_str", "category"])[price_col].sum().reset_index()

    categories = sorted(df["category"].unique())
    fig = go.Figure()
    for cat in categories:
        cat_data = agg[agg["category"] == cat].set_index("month_str")
        y_vals = [
            float(cat_data.loc[m, price_col]) if m in cat_data.index else 0.0
            for m in months
        ]
        fig.add_trace(
            go.Bar(
                x=months,
                y=y_vals,
                name=cat,
                marker_color=color_map.get(cat, "#888"),
                legendgroup=cat,
                hovertemplate=(
                    f"<b>{cat}</b><br>"
                    "Month: %{x}<br>"
                    "Amount: $%{y:.2f}"
                    "<extra></extra>"
                ),
            )
        )
    fig.update_layout(
        barmode="stack",
        xaxis_title="Month",
        yaxis_title=y_label,
        xaxis={"categoryorder": "array", "categoryarray": months},
        legend_title="Category",
        hovermode="closest",
        margin={"t": 30},
    )
    return fig


def monthly_category_line(
    df: pd.DataFrame,
    price_col: str,
    color_map: dict[str, str],
    months: list[str],
    y_label: str = "Amount ($)",
) -> go.Figure:
    """Line chart: one line per category, x=month, y=spend."""
    df = df.copy()
    df["month_str"] = df["date"].dt.to_period("M").astype(str)
    agg = df.groupby(["month_str", "category"])[price_col].sum().reset_index()

    categories = sorted(df["category"].unique())
    fig = go.Figure()
    for cat in categories:
        cat_data = agg[agg["category"] == cat].set_index("month_str")
        y_vals = [
            float(cat_data.loc[m, price_col]) if m in cat_data.index else 0.0
            for m in months
        ]
        fig.add_trace(
            go.Scatter(
                x=months,
                y=y_vals,
                mode="lines+markers",
                name=cat,
                line_color=color_map.get(cat, "#888"),
                hovertemplate=(
                    f"<b>{cat}</b><br>"
                    "Month: %{x}<br>"
                    "Amount: $%{y:.2f}"
                    "<extra></extra>"
                ),
            )
        )
    fig.update_layout(
        xaxis_title="Month",
        yaxis_title=y_label,
        xaxis={"categoryorder": "array", "categoryarray": months},
        legend_title="Category",
        margin={"t": 30},
    )
    return fig


def monthly_category_heatmap(
    df: pd.DataFrame,
    price_col: str,
    months: list[str],
    y_label: str = "Amount ($)",
) -> go.Figure:
    """Heatmap: categories (rows) × months (columns), cell color = spend."""
    df = df.copy()
    df["month_str"] = df["date"].dt.to_period("M").astype(str)
    agg = df.groupby(["month_str", "category"])[price_col].sum().reset_index()

    pivot = agg.pivot(index="category", columns="month_str", values=price_col).fillna(0.0)
    for m in months:
        if m not in pivot.columns:
            pivot[m] = 0.0
    pivot = pivot[months]
    pivot = pivot.loc[pivot.sum(axis=1).sort_values(ascending=False).index]

    fig = go.Figure(
        go.Heatmap(
            z=pivot.values.tolist(),
            x=months,
            y=pivot.index.tolist(),
            colorscale="Blues",
            hovertemplate="<b>%{y}</b><br>Month: %{x}<br>Amount: $%{z:.2f}<extra></extra>",
            colorbar={"title": {"text": y_label, "side": "right"}},
        )
    )
    fig.update_layout(
        xaxis_title="Month",
        yaxis_title="Category",
        margin={"t": 30},
    )
    return fig
