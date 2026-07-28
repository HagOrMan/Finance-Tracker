"use client";

import { useMemo, useState } from "react";

import { FilterBar } from "@/components/filter-bar";
import { CategoryPieChart } from "@/components/charts/category-pie-chart";
import { MultiSelect } from "@/components/multi-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useFilteredReceipts } from "@/hooks/use-filtered-receipts";
import { formatCurrency } from "@/lib/format";

export default function CategoriesPage() {
  const { receipts, isLoading, error, plabel, colorMap, pcol } =
    useFilteredReceipts();
  const [mode, setMode] = useState<"Sum" | "Mean">("Sum");
  const [tblCategories, setTblCategories] = useState<string[]>([]);
  const [tblStores, setTblStores] = useState<string[]>([]);

  const pieData = useMemo(() => {
    const byCat = new Map<string, number[]>();
    for (const r of receipts) {
      const arr = byCat.get(r.category) ?? [];
      arr.push(r[pcol]);
      byCat.set(r.category, arr);
    }
    return [...byCat.entries()].map(([category, values]) => ({
      category,
      value:
        mode === "Sum"
          ? values.reduce((a, b) => a + b, 0)
          : values.reduce((a, b) => a + b, 0) / values.length,
    }));
  }, [receipts, pcol, mode]);

  const tblCategoryOptions = useMemo(
    () => [...new Set(receipts.map((r) => r.category))].sort(),
    [receipts],
  );
  const tblStoreOptions = useMemo(
    () => [...new Set(receipts.map((r) => r.store))].sort(),
    [receipts],
  );

  const tblReceipts = useMemo(
    () =>
      receipts
        .filter((r) =>
          tblCategories.length ? tblCategories.includes(r.category) : true,
        )
        .filter((r) => (tblStores.length ? tblStores.includes(r.store) : true)),
    [receipts, tblCategories, tblStores],
  );

  const totalAll = tblReceipts.reduce((s, r) => s + r[pcol], 0);
  const summary = useMemo(() => {
    const byCat = new Map<string, { total: number; count: number }>();
    for (const r of tblReceipts) {
      const cur = byCat.get(r.category) ?? { total: 0, count: 0 };
      cur.total += r[pcol];
      cur.count += 1;
      byCat.set(r.category, cur);
    }
    return [...byCat.entries()]
      .map(([category, { total, count }]) => ({
        category,
        total,
        mean: total / count,
        count,
        pct: totalAll > 0 ? (total / totalAll) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [tblReceipts, totalAll]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">🗂️ Categories</h1>

      <FilterBar />

      {error && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load data."}
        </p>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && !error && receipts.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No receipts match the current filters.
        </p>
      )}

      {!isLoading && receipts.length > 0 && (
        <>
          <div className="flex w-fit items-center gap-1 rounded-md border border-border bg-card p-1">
            {(["Sum", "Mean"] as const).map((m) => (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={mode === m ? "default" : "ghost"}
                onClick={() => setMode(m)}
              >
                {m}
              </Button>
            ))}
          </div>

          <CategoryPieChart data={pieData} colorMap={colorMap} />

          <Separator />

          <div>
            <h2 className="mb-3 text-lg font-medium text-foreground">
              Summary by category
            </h2>
            <div className="mb-3 flex flex-wrap gap-3">
              <MultiSelect
                label="Filter by category"
                options={tblCategoryOptions}
                selected={tblCategories}
                onChange={setTblCategories}
                className="w-55 max-sm:w-full"
              />
              <MultiSelect
                label="Filter by store (affects totals)"
                options={tblStoreOptions}
                selected={tblStores}
                onChange={setTblStores}
                className="w-65 max-sm:w-full"
              />
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Total ({plabel})</TableHead>
                  <TableHead className="text-right">Mean ({plabel})</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">% of total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((row) => (
                  <TableRow key={row.category}>
                    <TableCell>{row.category}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(row.total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(row.mean)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.count}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.pct.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
