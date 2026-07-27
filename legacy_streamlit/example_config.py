from __future__ import annotations

from pathlib import Path

# --- Database -----------------------------------------------------------------

# Absolute path to the SQLite database. Use a raw string on Windows or forward
# slashes; pathlib normalizes both.
DB_PATH: Path = Path(r"C:\Users\path\to\your\database.db")

# --- UI defaults --------------------------------------------------------------

# Default lookback window when the app first loads, in days.
DEFAULT_DATE_RANGE_DAYS: int = 30

# Default state of the "Subtract refunds (show net paid)" checkbox.
DEFAULT_SUBTRACT_REFUNDS: bool = True

# --- Charts -------------------------------------------------------------------

# Color palette used to assign a color to each category. Choose any qualitative
# palette with enough distinct hues. Examples by library:
#   Plotly:     "Set3", "Dark24", "Plotly", "Bold"
#   Altair:     "tableau20", "category20"
#   Matplotlib: "tab20", "Set3"
# The actual lookup happens in finance_tracker/colors.py — this is just the name.
CATEGORY_PALETTE: str = "tab20"

# How many days forward the spend-extrapolation line on the Savings page projects.
EXTRAPOLATION_FORWARD_DAYS: int = 30

# --- App metadata -------------------------------------------------------------

APP_TITLE: str = "Finance Tracker"
APP_ICON: str = "💸"
