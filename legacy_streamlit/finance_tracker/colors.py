"""Stable category-to-color mapping used by every chart."""

from __future__ import annotations

import plotly.colors as pc
import streamlit as st


@st.cache_data
def get_category_colors(categories: tuple[str, ...]) -> dict[str, str]:
    """Return a stable {category: hex_color} mapping for the given sorted categories."""
    palette = pc.qualitative.Dark24
    return {cat: palette[i % len(palette)] for i, cat in enumerate(sorted(categories))}
