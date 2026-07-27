import type { MergedReceipt } from "@/lib/data/types";

// Port of pages/4_Savings.py::compute_savings. price in the DB is
// post-discount: price = (original - discount) * (1 - pct/100). So:
//   savings from flat discount = discount
//   savings from pct discount  = price * pct / (100 - pct)   [pct < 100]
export function computeSavings(row: Pick<MergedReceipt, "price" | "discount" | "discount_percentage">): number {
  const flat = row.discount || 0;
  const pct = row.discount_percentage || 0;
  const pctSavings = pct < 100 ? (row.price * pct) / (100 - pct) : row.price;
  return flat + pctSavings;
}
