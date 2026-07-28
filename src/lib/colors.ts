// Category -> color mapping. Port of finance_tracker/colors.py's rule (sort
// categories alphabetically, assign from a fixed qualitative palette, cycle
// past the end) but brand-tuned and CVD-validated per the dataviz skill:
// slots 1/2/5 substitute the brand's breeze/lush/nebula hues into the
// reference 8-hue categorical anchor (same adjacency order the reference
// validated, so substituting same-family hues keeps it passing — see
// ARCHITECTURE.md for the exact `validate_palette.js` runs). Slots 9-12 extend
// past the 8 safe anchors as a white-mixed tint of slots 1-4; every chart
// using this map also shows the category name in its legend/tooltip, so
// identity is never carried by color alone even in that lower-safety tier.
const BASE_LIGHT = [
  "#09ACEE", // breeze (blue)
  "#00D1B0", // lush (turquoise)
  "#eda100", // yellow
  "#008300", // green
  "#785BF9", // nebula (violet)
  "#e34948", // red
  "#e87ba4", // magenta
  "#eb6834", // orange
] as const;

const BASE_DARK = [
  "#2F93C8", // breeze
  "#17A689", // lush
  "#c98500", // yellow
  "#008300", // green
  "#594FFF", // nebula
  "#e66767", // red
  "#d55181", // magenta
  "#d95926", // orange
] as const;

function mixWithWhite(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  return `#${[mix(r), mix(g), mix(b)]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
}

const EXTENSION_TINT = 0.45;

export const CATEGORY_PALETTE_LIGHT: readonly string[] = [
  ...BASE_LIGHT,
  ...BASE_LIGHT.slice(0, 4).map((c) => mixWithWhite(c, EXTENSION_TINT)),
];

export const CATEGORY_PALETTE_DARK: readonly string[] = [
  ...BASE_DARK,
  ...BASE_DARK.slice(0, 4).map((c) => mixWithWhite(c, EXTENSION_TINT)),
];

export function buildCategoryColorMap(
  categories: Iterable<string>,
  mode: "light" | "dark" = "light"
): Record<string, string> {
  const palette = mode === "dark" ? CATEGORY_PALETTE_DARK : CATEGORY_PALETTE_LIGHT;
  const sorted = [...new Set(categories)].sort((a, b) => a.localeCompare(b));
  const map: Record<string, string> = {};
  sorted.forEach((cat, i) => {
    map[cat] = palette[i % palette.length]!;
  });
  return map;
}
