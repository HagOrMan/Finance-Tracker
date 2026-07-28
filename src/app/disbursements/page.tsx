"use client";

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterShell } from "@/components/filter-shell";
import { MultiSelect } from "@/components/multi-select";
import { StatCard } from "@/components/charts/stat-card";
import { SingleSeriesBarChart } from "@/components/charts/single-series-bar-chart";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useDisbursements,
  useMergedReceipts,
  useRefreshFinanceData,
} from "@/hooks/use-finance-data";
import { useFiltersStore } from "@/store/filters-store";
import { formatCurrency } from "@/lib/format";
import { daysBetween, isoWeekStart } from "@/lib/dates";

type TypeFilter = "All" | "Refund" | "Standalone";

export default function DisbursementsPage() {
  const { data: disbData, isLoading, error } = useDisbursements();
  const { data: receiptsData } = useMergedReceipts();
  const refresh = useRefreshFinanceData();
  const disbursements = useMemo(() => disbData ?? [], [disbData]);
  const receipts = useMemo(() => receiptsData ?? [], [receiptsData]);

  const startDate = useFiltersStore((s) => s.startDate);
  const endDate = useFiltersStore((s) => s.endDate);
  const entities = useFiltersStore((s) => s.entities);
  const setDateRange = useFiltersStore((s) => s.setDateRange);
  const setEntities = useFiltersStore((s) => s.setEntities);

  const entityOptions = useMemo(
    () => [...new Set(disbursements.map((d) => d.entity))].sort(),
    [disbursements],
  );

  const filtered = useMemo(() => {
    return disbursements
      .filter((d) => d.date_received >= startDate && d.date_received <= endDate)
      .filter((d) => (entities.length ? entities.includes(d.entity) : true));
  }, [disbursements, startDate, endDate, entities]);

  const totalReceived = filtered.reduce((s, d) => s + d.amount, 0);
  const totalRefunds = filtered
    .filter((d) => d.refunded_from_receipt != null)
    .reduce((s, d) => s + d.amount, 0);
  const totalStandalone = totalReceived - totalRefunds;

  const dateRangeDays = daysBetween(startDate, endDate) + 1;

  const timeSeries = useMemo(() => {
    const useWeekly = dateRangeDays > 60;
    const byBucket = new Map<string, number>();
    for (const d of filtered) {
      const bucket = useWeekly
        ? isoWeekStart(d.date_received)
        : d.date_received;
      byBucket.set(bucket, (byBucket.get(bucket) ?? 0) + d.amount);
    }
    return [...byBucket.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([x, y]) => ({ x, y }));
  }, [filtered, dateRangeDays]);

  const byEntity = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of filtered)
      map.set(d.entity, (map.get(d.entity) ?? 0) + d.amount);
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([x, y]) => ({ x, y }));
  }, [filtered]);

  const receiptById = useMemo(
    () => new Map(receipts.map((r) => [r.id, r])),
    [receipts],
  );

  const [tblEntities, setTblEntities] = useState<string[]>([]);
  const [tblType, setTblType] = useState<TypeFilter>("All");
  const [reasonSearch, setReasonSearch] = useState("");
  const [tblStores, setTblStores] = useState<string[]>([]);
  const [tblCategories, setTblCategories] = useState<string[]>([]);

  const linkedStoreOptions = useMemo(
    () =>
      [
        ...new Set(
          filtered
            .map((d) =>
              d.refunded_from_receipt != null
                ? receiptById.get(d.refunded_from_receipt)?.store
                : undefined,
            )
            .filter((v): v is string => !!v),
        ),
      ].sort(),
    [filtered, receiptById],
  );
  const linkedCategoryOptions = useMemo(
    () =>
      [
        ...new Set(
          filtered
            .map((d) =>
              d.refunded_from_receipt != null
                ? receiptById.get(d.refunded_from_receipt)?.category
                : undefined,
            )
            .filter((v): v is string => !!v),
        ),
      ].sort(),
    [filtered, receiptById],
  );

  const tblRows = useMemo(
    () =>
      filtered
        .filter((d) =>
          tblEntities.length ? tblEntities.includes(d.entity) : true,
        )
        .filter((d) => {
          if (tblType === "Refund") return d.refunded_from_receipt != null;
          if (tblType === "Standalone") return d.refunded_from_receipt == null;
          return true;
        })
        .filter((d) =>
          reasonSearch
            ? (d.reason ?? "")
                .toLowerCase()
                .includes(reasonSearch.toLowerCase())
            : true,
        )
        .filter((d) => {
          if (!tblStores.length) return true;
          const linked =
            d.refunded_from_receipt != null
              ? receiptById.get(d.refunded_from_receipt)
              : undefined;
          return linked ? tblStores.includes(linked.store) : false;
        })
        .filter((d) => {
          if (!tblCategories.length) return true;
          const linked =
            d.refunded_from_receipt != null
              ? receiptById.get(d.refunded_from_receipt)
              : undefined;
          return linked ? tblCategories.includes(linked.category) : false;
        })
        .sort((a, b) => (a.date_received < b.date_received ? 1 : -1)),
    [
      filtered,
      tblEntities,
      tblType,
      reasonSearch,
      tblStores,
      tblCategories,
      receiptById,
    ],
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">
        📥 Disbursements
      </h1>

      <FilterShell activeCount={entities.length > 0 ? 1 : 0}>
        <div className="flex flex-col gap-1">
          <Label
            className="text-xs font-medium text-muted-foreground"
            htmlFor="disb-start"
          >
            Date range
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="disb-start"
              type="date"
              value={startDate}
              onChange={(e) => setDateRange(e.target.value, endDate)}
              className="w-37.5 max-sm:w-auto max-sm:min-w-0 max-sm:flex-1"
            />
            <span className="text-muted-foreground">-</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setDateRange(startDate, e.target.value)}
              className="w-37.5 max-sm:w-auto max-sm:min-w-0 max-sm:flex-1"
            />
          </div>
        </div>
        <MultiSelect
          label="Entity"
          options={entityOptions}
          selected={entities}
          onChange={setEntities}
          className="w-55 max-sm:w-full"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={refresh}
          aria-label="Refresh data"
          className="max-sm:self-end"
        >
          <RefreshCw className="size-4" />
        </Button>
      </FilterShell>

      {error && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load data."}
        </p>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && !error && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No disbursements match the current filters.
        </p>
      )}

      {!isLoading && filtered.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Total received"
              value={formatCurrency(totalReceived)}
            />
            <StatCard
              label="Refunds (linked)"
              value={formatCurrency(totalRefunds)}
            />
            <StatCard
              label="Standalone income"
              value={formatCurrency(totalStandalone)}
            />
            <StatCard label="Entries" value={filtered.length} />
          </div>

          <Separator />
          <div>
            <h2 className="mb-3 text-lg font-medium text-foreground">
              Disbursements over time
            </h2>
            <SingleSeriesBarChart
              data={timeSeries}
              color="#eb6834"
              seriesName="Amount"
            />
          </div>

          <div>
            <h2 className="mb-3 text-lg font-medium text-foreground">
              By entity
            </h2>
            <SingleSeriesBarChart
              data={byEntity}
              color="var(--color-primary)"
              seriesName="Amount"
            />
          </div>

          <Separator />
          <div>
            <h2 className="mb-3 text-lg font-medium text-foreground">
              All disbursements
            </h2>
            <div className="mb-3 flex flex-wrap gap-3">
              <MultiSelect
                label="Filter by entity"
                options={entityOptions}
                selected={tblEntities}
                onChange={setTblEntities}
                className="w-50 max-sm:w-full"
              />
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-medium text-muted-foreground">
                  Type
                </Label>
                <Select
                  value={tblType}
                  onValueChange={(v) => setTblType(v as TypeFilter)}
                >
                  <SelectTrigger className="w-35 max-sm:w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All</SelectItem>
                    <SelectItem value="Refund">Refund</SelectItem>
                    <SelectItem value="Standalone">Standalone</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex min-w-50 flex-1 flex-col gap-1 max-sm:min-w-0 max-sm:basis-full">
                <Label className="text-xs font-medium text-muted-foreground">
                  Search reason
                </Label>
                <Input
                  value={reasonSearch}
                  onChange={(e) => setReasonSearch(e.target.value)}
                  placeholder="type to search…"
                />
              </div>
              {linkedStoreOptions.length > 0 && (
                <MultiSelect
                  label="Filter by linked store"
                  options={linkedStoreOptions}
                  selected={tblStores}
                  onChange={setTblStores}
                  className="w-50 max-sm:w-full"
                />
              )}
              {linkedCategoryOptions.length > 0 && (
                <MultiSelect
                  label="Filter by linked category"
                  options={linkedCategoryOptions}
                  selected={tblCategories}
                  onChange={setTblCategories}
                  className="w-50 max-sm:w-full"
                />
              )}
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Linked store</TableHead>
                  <TableHead>Linked category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tblRows.map((d) => {
                  const linked =
                    d.refunded_from_receipt != null
                      ? receiptById.get(d.refunded_from_receipt)
                      : undefined;
                  return (
                    <TableRow key={d.id}>
                      <TableCell>{d.date_received}</TableCell>
                      <TableCell>{d.entity}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(d.amount)}
                      </TableCell>
                      <TableCell>
                        {d.refunded_from_receipt != null
                          ? "Refund"
                          : "Standalone"}
                      </TableCell>
                      <TableCell>{d.reason ?? ""}</TableCell>
                      <TableCell>{linked?.store ?? ""}</TableCell>
                      <TableCell>{linked?.category ?? ""}</TableCell>
                    </TableRow>
                  );
                })}
                {tblRows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-muted-foreground"
                    >
                      No disbursements match.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
