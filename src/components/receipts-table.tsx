"use client";

import { useMemo, useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/multi-select";
import { formatCurrency } from "@/lib/format";
import type { MergedReceipt } from "@/lib/data/types";

export function ReceiptsTable({
  receipts,
  priceKey,
  priceLabel,
  showDiscountColumns = false,
  limit,
}: {
  receipts: MergedReceipt[];
  /** Which column the `priceLabel` header actually reflects — "price" (gross) or "actual_price" (net). */
  priceKey: "price" | "actual_price";
  priceLabel: string;
  showDiscountColumns?: boolean;
  limit?: number;
}) {
  const [category, setCategory] = useState<string[]>([]);
  const [store, setStore] = useState<string[]>([]);
  const [noteSearch, setNoteSearch] = useState("");

  const categoryOptions = useMemo(
    () => [...new Set(receipts.map((r) => r.category))].sort(),
    [receipts],
  );
  const storeOptions = useMemo(
    () => [...new Set(receipts.map((r) => r.store))].sort(),
    [receipts],
  );

  let filtered = receipts
    .filter((r) => (category.length ? category.includes(r.category) : true))
    .filter((r) => (store.length ? store.includes(r.store) : true))
    .filter((r) =>
      noteSearch
        ? (r.note ?? "").toLowerCase().includes(noteSearch.toLowerCase())
        : true,
    )
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));

  if (limit) filtered = filtered.slice(0, limit);

  const colSpan = 7 + (showDiscountColumns ? 2 : 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <MultiSelect
          label="Filter by category"
          options={categoryOptions}
          selected={category}
          onChange={setCategory}
          className="w-50"
        />
        <MultiSelect
          label="Filter by store"
          options={storeOptions}
          selected={store}
          onChange={setStore}
          className="w-50"
        />
        <div className="flex min-w-50 flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            Search notes
          </span>
          <Input
            value={noteSearch}
            onChange={(e) => setNoteSearch(e.target.value)}
            placeholder="type to search…"
          />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Store</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Refunded</TableHead>
            <TableHead className="text-right">{priceLabel}</TableHead>
            {showDiscountColumns && (
              <TableHead className="text-right">Discount</TableHead>
            )}
            {showDiscountColumns && (
              <TableHead className="text-right">Discount %</TableHead>
            )}
            <TableHead>Note</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.date}</TableCell>
              <TableCell>{r.store}</TableCell>
              <TableCell>{r.category}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(r.price)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(r.total_refunded)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(r[priceKey])}
              </TableCell>
              {showDiscountColumns && (
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(r.discount)}
                </TableCell>
              )}
              {showDiscountColumns && (
                <TableCell className="text-right tabular-nums">
                  {r.discount_percentage.toFixed(1)}%
                </TableCell>
              )}
              <TableCell className="max-w-60 truncate">
                {r.note ?? ""}
              </TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={colSpan}
                className="text-center text-muted-foreground"
              >
                No receipts match.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
