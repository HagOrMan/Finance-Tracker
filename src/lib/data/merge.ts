import type { Receipt, Disbursement, MergedReceipt } from "./types";

// Direct port of the left-join + groupby-sum in the old
// finance_tracker/data.py::load_merged_receipts. Only disbursements with a
// non-null refunded_from_receipt count as a refund against a receipt.
export function mergeReceipts(
  receipts: Receipt[],
  disbursements: Disbursement[]
): MergedReceipt[] {
  const refundsByReceipt = new Map<number, number>();
  for (const d of disbursements) {
    if (d.refunded_from_receipt == null) continue;
    refundsByReceipt.set(
      d.refunded_from_receipt,
      (refundsByReceipt.get(d.refunded_from_receipt) ?? 0) + d.amount
    );
  }

  return receipts.map((r) => {
    const total_refunded = refundsByReceipt.get(r.id) ?? 0;
    return {
      ...r,
      total_refunded,
      actual_price: r.price - total_refunded,
    };
  });
}
