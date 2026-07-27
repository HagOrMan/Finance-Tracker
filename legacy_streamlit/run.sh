#!/usr/bin/env bash
# Run from inside legacy_streamlit/ (this app was superseded by the Next.js app
# at the repo root — see ../migration.md — and is kept here as a fallback).
cd "$(dirname "$0")"
. .venv/Scripts/activate && streamlit run app.py
