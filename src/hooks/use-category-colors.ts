"use client";

import { useMemo } from "react";
import { useTheme } from "next-themes";

import { buildCategoryColorMap } from "@/lib/colors";

export function useCategoryColors(categories: string[]) {
  const { resolvedTheme } = useTheme();
  const mode = resolvedTheme === "dark" ? "dark" : "light";
  const key = [...new Set(categories)].sort().join("|");

  return useMemo(
    () => buildCategoryColorMap(categories, mode),
    // `key` (sorted/deduped category list) and `mode` fully determine the
    // output map; `categories` itself is intentionally excluded so a new
    // array with the same contents doesn't force a rebuild every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, mode]
  );
}
