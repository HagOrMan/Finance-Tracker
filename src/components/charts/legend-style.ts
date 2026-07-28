import type { CSSProperties } from "react";

/**
 * Shared `wrapperStyle` for every Recharts `<Legend>`.
 *
 * The cap is the point. Recharts measures the rendered legend box and
 * subtracts its height from the plot area, so a twelve-category legend — which
 * is one row on a desktop and five on a 390px phone — quietly ate about a
 * third of the chart. Capping the box and letting it scroll means the plot
 * keeps a predictable amount of room at any width, and the categories that
 * don't fit are a short scroll away rather than gone.
 */
export const LEGEND_STYLE: CSSProperties = {
  fontSize: 12,
  maxHeight: 76,
  overflowY: "auto",
};
