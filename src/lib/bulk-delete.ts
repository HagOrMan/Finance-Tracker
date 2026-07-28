/**
 * Bulk delete, one row at a time.
 *
 * There is deliberately **no bulk delete endpoint.** Phase 0 built
 * `DELETE /api/receipts/[id]` with a per-row guard that returns 409 plus the
 * disbursements blocking it (ARCHITECTURE.md), and that guard is per-row by
 * nature — a set-based delete would either fail the whole batch on one linked
 * receipt or silently skip it. Looping the single-row endpoint keeps the guard
 * meaningful and lets the caller report exactly which rows survived.
 *
 * Sequential rather than `Promise.all`: a hundred concurrent DELETEs against a
 * personal Supabase project is a self-inflicted rate limit, and nothing here is
 * latency-sensitive enough to care.
 */
export interface BulkDeleteResult {
  deleted: number[];
  failed: { id: number; message: string }[];
}

export async function deleteSequentially(
  ids: readonly number[],
  remove: (id: number) => Promise<unknown>,
): Promise<BulkDeleteResult> {
  const deleted: number[] = [];
  const failed: { id: number; message: string }[] = [];

  for (const id of ids) {
    try {
      await remove(id);
      deleted.push(id);
    } catch (error) {
      failed.push({
        id,
        message: error instanceof Error ? error.message : "Delete failed",
      });
    }
  }

  return { deleted, failed };
}
