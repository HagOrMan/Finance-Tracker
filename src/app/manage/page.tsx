"use client";

import { useMemo } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DisbursementsTable } from "@/components/disbursements-table";
import { RefreshButton } from "@/components/filter-actions";
import { ReceiptsTable } from "@/components/receipts-table";
import { useDisbursements, useMergedReceipts } from "@/hooks/use-finance-data";

/**
 * The CRUD tables (ARCHITECTURE.md). Deliberately thin: Phase 0 built the write
 * path, Phase 1 built the editors' first caller, and this page is
 * `ReceiptsTable` / `DisbursementsTable` with `editable` and `selectable`
 * turned on.
 *
 * **No `FilterBar`**, for the same reason `/stores` has none: every other page
 * is a lens over a date range, and the row you came here to fix is as likely to
 * be two years old as two days. Each table carries its own field filters
 * instead, and reports how many rows it's showing of the total so a narrow
 * filter never reads as an empty ledger.
 *
 * All three money columns are shown (gross Price, Refunded, Net paid) rather
 * than the usual one-or-the-other: this is the table where you edit the number
 * that was actually typed in, and seeing gross next to the refunds that eat it
 * is how you notice a refund attached to the wrong receipt.
 */
export default function ManagePage() {
  const {
    data: receiptsData,
    isLoading,
    error: receiptsError,
  } = useMergedReceipts();
  const { data: disbursementsData, error: disbursementsError } =
    useDisbursements();

  const receipts = useMemo(() => receiptsData ?? [], [receiptsData]);
  const disbursements = useMemo(
    () => disbursementsData ?? [],
    [disbursementsData],
  );
  const error = receiptsError ?? disbursementsError;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">
          🗃️ Receipts &amp; disbursements
        </h1>
        <RefreshButton />
      </div>

      {error && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load data."}
        </p>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && !error && (
        <Tabs defaultValue="receipts">
          <TabsList>
            <TabsTrigger value="receipts">
              Receipts ({receipts.length})
            </TabsTrigger>
            <TabsTrigger value="disbursements">
              Disbursements ({disbursements.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="receipts" className="mt-4">
            <ReceiptsTable
              receipts={receipts}
              priceKey="actual_price"
              priceLabel="Net paid"
              showDiscountColumns
              editable
              selectable
            />
          </TabsContent>
          <TabsContent value="disbursements" className="mt-4">
            <DisbursementsTable
              disbursements={disbursements}
              receipts={receipts}
              editable
              selectable
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
