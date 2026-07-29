"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CategoryMixBar } from "@/components/category-mix-bar";
import { RefreshButton } from "@/components/filter-actions";
import { EntityDetailModal } from "@/components/entity-detail-modal";
import { StoreDetailModal } from "@/components/store-detail-modal";
import {
  NameMergeDialog,
  type MergeSide,
} from "@/components/store-merge-dialog";
import { useCategoryColors } from "@/hooks/use-category-colors";
import {
  useBulkUpdateDisbursements,
  useBulkUpdateReceipts,
  useDisbursements,
  useMergedReceipts,
} from "@/hooks/use-finance-data";
import type { Disbursement, MergedReceipt } from "@/lib/data/types";
import {
  buildEntityGroups,
  sortEntityGroups,
  type EntityGroup,
} from "@/lib/entities";
import { formatCurrency } from "@/lib/format";
import {
  candidateKeySet,
  duplicateCandidates,
  type DuplicateCandidate,
} from "@/lib/name-groups";
import { buildStoreGroups, type StoreGroup } from "@/lib/stores";

/**
 * The hygiene page (ARCHITECTURE.md). Two tabs over the same machinery:
 * **Stores** over `receipts.store`, **Entities** over `disbursements.entity`.
 *
 * Two things about it that are deliberate:
 *
 * 1. **It needs no new read endpoint.** `useMergedReceipts` / `useDisbursements`
 *    already pull everything into the client, so the whole page is a
 *    client-side aggregation over data that is in memory. Only the writes are
 *    new, and Phase 0 built those.
 * 2. **There is no `FilterBar`.** Every other page is a lens over a date range;
 *    this one is a lens over the *whole ledger*. A mis-filed receipt from two
 *    years ago is exactly what you came here to find, and a 30-day default
 *    would hide it.
 */
export default function StoresPage() {
  const {
    data: receiptsData,
    isLoading: receiptsLoading,
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
        <h1 className="text-2xl font-semibold text-foreground">🏪 Stores</h1>
        <RefreshButton />
      </div>

      {error && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load data."}
        </p>
      )}
      {receiptsLoading && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {!receiptsLoading && !error && (
        <Tabs defaultValue="stores">
          <TabsList>
            <TabsTrigger value="stores">Stores</TabsTrigger>
            <TabsTrigger value="entities">Entities</TabsTrigger>
          </TabsList>
          <TabsContent value="stores" className="mt-4">
            <StoresTab receipts={receipts} />
          </TabsContent>
          <TabsContent value="entities" className="mt-4">
            <EntitiesTab
              disbursements={disbursements}
              receipts={receipts}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

type StoreFilter = "all" | "inconsistent" | "duplicates";

function StoresTab({ receipts }: { receipts: MergedReceipt[] }) {
  const bulkUpdate = useBulkUpdateReceipts();

  const [filter, setFilter] = useState<StoreFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [merging, setMerging] = useState<DuplicateCandidate<StoreGroup> | null>(
    null,
  );

  const groups = useMemo(() => buildStoreGroups(receipts), [receipts]);
  const candidates = useMemo(() => duplicateCandidates(groups), [groups]);
  const candidateKeys = useMemo(
    () => candidateKeySet(candidates),
    [candidates],
  );

  const categories = useMemo(
    () => receipts.map((r) => r.category),
    [receipts],
  );
  const colorMap = useCategoryColors(categories);

  const inconsistentCount = groups.filter((g) => g.isInconsistent).length;

  const query = search.trim().toLowerCase();
  const visible = groups
    .filter((g) => {
      if (filter === "inconsistent") return g.isInconsistent;
      if (filter === "duplicates") return candidateKeys.has(g.key);
      return true;
    })
    .filter((g) =>
      query ? g.spellings.some((s) => s.toLowerCase().includes(query)) : true,
    );

  const selected = groups.find((g) => g.key === selectedKey) ?? null;

  async function mergeStores(target: string, ids: number[]) {
    try {
      const result = await bulkUpdate.mutateAsync({
        ids,
        patch: { store: target },
      });
      toast.success(
        `${result.updated} receipt${result.updated === 1 ? "" : "s"} merged into ${target}`,
      );
      setMerging(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Merge failed");
    }
  }

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No receipts yet — nothing to tidy.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Three across is ~110px per tile on a phone, which wraps "Possible
          duplicates" onto three lines. Two up top and one wide below reads as
          a deliberate layout instead. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <FilterCard
          label="Stores"
          value={groups.length}
          active={filter === "all"}
          onClick={() => setFilter("all")}
          hint="Show everything"
        />
        <FilterCard
          label="Inconsistent"
          value={inconsistentCount}
          tone={inconsistentCount > 0 ? "warn" : undefined}
          active={filter === "inconsistent"}
          onClick={() =>
            setFilter(filter === "inconsistent" ? "all" : "inconsistent")
          }
          hint="Stores whose receipts sit in more than one category"
        />
        <FilterCard
          label="Possible duplicates"
          value={candidates.length}
          tone={candidates.length > 0 ? "warn" : undefined}
          active={filter === "duplicates"}
          onClick={() =>
            setFilter(filter === "duplicates" ? "all" : "duplicates")
          }
          hint="Name pairs that look like the same store"
          className="max-sm:col-span-2"
        />
      </div>

      {candidates.length > 0 && (
        <DuplicateCallout
          noun="store"
          candidates={candidates}
          describe={(g) => `${g.displayName} (${g.receiptCount})`}
          onMerge={setMerging}
        />
      )}

      <div className="flex flex-col gap-1">
        <Label htmlFor="store-search" className="text-xs text-muted-foreground">
          Search stores
        </Label>
        <Input
          id="store-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="type to search…"
          className="max-w-80"
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Store</TableHead>
            <TableHead className="text-right">Receipts</TableHead>
            <TableHead className="text-right">Gross</TableHead>
            <TableHead className="text-right">Net</TableHead>
            <TableHead>Range</TableHead>
            <TableHead className="w-56">Category mix</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((g) => (
            <TableRow
              key={g.key}
              className="cursor-pointer"
              onClick={() => setSelectedKey(g.key)}
            >
              <TableCell className="max-w-60">
                <button
                  type="button"
                  className="block max-w-full cursor-pointer truncate text-left font-medium hover:underline"
                  title={g.spellings.join(" · ")}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedKey(g.key);
                  }}
                >
                  {g.displayName}
                </button>
                {g.spellings.length > 1 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {g.spellings.length} spellings
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {g.receiptCount}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(g.gross)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(g.net)}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {g.firstDate} – {g.lastDate}
              </TableCell>
              <TableCell>
                <CategoryMixBar segments={g.categories} colorMap={colorMap} />
                {g.minorityCount > 0 && (
                  <span className="mt-1 block text-xs text-destructive">
                    {g.minorityCount} not in &ldquo;{g.dominantCategory}&rdquo;
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
          {visible.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No stores match.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {selected && (
        <StoreDetailModal
          group={selected}
          receipts={receipts}
          allGroups={groups}
          colorMap={colorMap}
          open
          onOpenChange={(next) => {
            if (!next) setSelectedKey(null);
          }}
        />
      )}

      {merging && (
        <NameMergeDialog
          open
          onOpenChange={(next) => {
            if (!next) setMerging(null);
          }}
          noun="store"
          reason={merging.reason}
          a={storeSide(merging.a)}
          b={storeSide(merging.b)}
          busy={bulkUpdate.isPending}
          onMerge={mergeStores}
        />
      )}
    </div>
  );
}

function storeSide(g: StoreGroup): MergeSide {
  return {
    key: g.key,
    displayName: g.displayName,
    spellings: g.spellings,
    ids: g.receiptIds,
    count: g.receiptCount,
  };
}

// ---------------------------------------------------------------------------
// Entities (ARCHITECTURE.md / D11)
// ---------------------------------------------------------------------------

function EntitiesTab({
  disbursements,
  receipts,
}: {
  disbursements: Disbursement[];
  receipts: MergedReceipt[];
}) {
  const bulkUpdate = useBulkUpdateDisbursements();

  const [onlyDuplicates, setOnlyDuplicates] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [merging, setMerging] = useState<DuplicateCandidate<EntityGroup> | null>(
    null,
  );

  const unsorted = useMemo(
    () => buildEntityGroups(disbursements),
    [disbursements],
  );
  const candidates = useMemo(() => duplicateCandidates(unsorted), [unsorted]);
  const candidateKeys = useMemo(
    () => candidateKeySet(candidates),
    [candidates],
  );
  // Duplicate-name candidates first: with no category-consistency signal to
  // rank by, near-duplicate names *are* the finding on this tab.
  const groups = useMemo(
    () => sortEntityGroups(unsorted, candidateKeys),
    [unsorted, candidateKeys],
  );

  const query = search.trim().toLowerCase();
  const visible = groups
    .filter((g) => (onlyDuplicates ? candidateKeys.has(g.key) : true))
    .filter((g) =>
      query ? g.spellings.some((s) => s.toLowerCase().includes(query)) : true,
    );

  const selected = groups.find((g) => g.key === selectedKey) ?? null;

  async function mergeEntities(target: string, ids: number[]) {
    try {
      const result = await bulkUpdate.mutateAsync({
        ids,
        patch: { entity: target },
      });
      toast.success(
        `${result.updated} disbursement${result.updated === 1 ? "" : "s"} merged into ${target}`,
      );
      setMerging(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Merge failed");
    }
  }

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No disbursements yet — nothing to tidy.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <FilterCard
          label="Entities"
          value={groups.length}
          active={!onlyDuplicates}
          onClick={() => setOnlyDuplicates(false)}
          hint="Show everything"
        />
        <FilterCard
          label="Possible duplicates"
          value={candidates.length}
          tone={candidates.length > 0 ? "warn" : undefined}
          active={onlyDuplicates}
          onClick={() => setOnlyDuplicates((v) => !v)}
          hint="Name pairs that look like the same payer"
        />
      </div>

      {candidates.length > 0 && (
        <DuplicateCallout
          noun="entity"
          candidates={candidates}
          describe={(g) => `${g.displayName} (${g.count})`}
          onMerge={setMerging}
        />
      )}

      <div className="flex flex-col gap-1">
        <Label htmlFor="entity-search" className="text-xs text-muted-foreground">
          Search entities
        </Label>
        <Input
          id="entity-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="type to search…"
          className="max-w-80"
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Entity</TableHead>
            <TableHead className="text-right">Entries</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Refunds</TableHead>
            <TableHead>Range</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((g) => (
            <TableRow
              key={g.key}
              className="cursor-pointer"
              onClick={() => setSelectedKey(g.key)}
            >
              <TableCell className="max-w-60">
                <button
                  type="button"
                  className="block max-w-full cursor-pointer truncate text-left font-medium hover:underline"
                  title={g.spellings.join(" · ")}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedKey(g.key);
                  }}
                >
                  {g.displayName}
                </button>
                {g.spellings.length > 1 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {g.spellings.length} spellings
                  </span>
                )}
                {candidateKeys.has(g.key) && (
                  <span className="ml-2 text-xs text-destructive">
                    possible duplicate
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{g.count}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(g.total)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {g.refundCount === 0
                  ? "—"
                  : `${g.refundCount} · ${formatCurrency(g.refundTotal)}`}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {g.firstDate} – {g.lastDate}
              </TableCell>
            </TableRow>
          ))}
          {visible.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No entities match.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {selected && (
        <EntityDetailModal
          group={selected}
          disbursements={disbursements}
          allGroups={groups}
          receipts={receipts}
          open
          onOpenChange={(next) => {
            if (!next) setSelectedKey(null);
          }}
        />
      )}

      {merging && (
        <NameMergeDialog
          open
          onOpenChange={(next) => {
            if (!next) setMerging(null);
          }}
          noun="entity"
          reason={merging.reason}
          a={entitySide(merging.a)}
          b={entitySide(merging.b)}
          busy={bulkUpdate.isPending}
          onMerge={mergeEntities}
        />
      )}
    </div>
  );
}

function entitySide(g: EntityGroup): MergeSide {
  return {
    key: g.key,
    displayName: g.displayName,
    spellings: g.spellings,
    ids: g.disbursementIds,
    count: g.count,
  };
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function FilterCard({
  label,
  value,
  hint,
  active,
  tone,
  onClick,
  className,
}: {
  label: string;
  value: number;
  hint: string;
  active: boolean;
  tone?: "warn";
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      aria-pressed={active}
      className={cn(
        "flex min-w-0 cursor-pointer flex-col items-start rounded-lg border p-3 text-left transition-colors",
        active
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:bg-accent",
        className,
      )}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-xl font-semibold tabular-nums",
          tone === "warn" ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </span>
    </button>
  );
}

/**
 * The duplicate-name callout. Suggestion only, per D6 — nothing here merges
 * anything until a human opens the dialog and picks a winning name.
 */
function DuplicateCallout<T extends { key: string }>({
  noun,
  candidates,
  describe,
  onMerge,
}: {
  noun: string;
  candidates: DuplicateCandidate<T>[];
  describe: (group: T) => string;
  onMerge: (candidate: DuplicateCandidate<T>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? candidates : candidates.slice(0, 5);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-secondary bg-secondary/5 p-3">
      <p className="text-sm font-medium text-foreground">
        {candidates.length} {noun} name pair
        {candidates.length === 1 ? "" : "s"} look like the same {noun}
      </p>
      <ul className="flex flex-col gap-1">
        {shown.map((c) => (
          <li
            key={`${c.a.key}|${c.b.key}`}
            className="flex flex-wrap items-center gap-2 text-sm"
          >
            <span className="min-w-0 truncate">{describe(c.a)}</span>
            <span className="text-muted-foreground">vs</span>
            <span className="min-w-0 truncate">{describe(c.b)}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={() => onMerge(c)}
            >
              Merge…
            </Button>
          </li>
        ))}
      </ul>
      {candidates.length > shown.length && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="self-start"
          onClick={() => setExpanded(true)}
        >
          Show {candidates.length - shown.length} more
        </Button>
      )}
      {expanded && candidates.length > 5 && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="self-start"
          onClick={() => setExpanded(false)}
        >
          Show fewer
        </Button>
      )}
      <Separator className="my-1" />
      <p className="text-xs text-muted-foreground">
        Suggestions only — nothing is merged until you pick a name. Whitespace
        and capitalization are already grouped automatically.
      </p>
    </div>
  );
}
