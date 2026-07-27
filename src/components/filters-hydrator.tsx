"use client";

import { useEffect } from "react";

import { useFiltersStore } from "@/store/filters-store";

export function FiltersHydrator() {
  useEffect(() => {
    useFiltersStore.persist.rehydrate();
  }, []);

  return null;
}
