"use client";

import { useMemo, useState } from "react";
import { Pause, Play, Plus, Zap } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SubscriptionEditor } from "@/components/subscription-editor";
import {
  useChargeSubscriptionNow,
  useMergedReceipts,
  useRunDueCharges,
  useSubscriptions,
  useUpdateSubscription,
} from "@/hooks/use-finance-data";
import type { Subscription } from "@/lib/data/types";
import { formatCurrency } from "@/lib/format";
import { todayISO } from "@/lib/filters";
import {
  cadenceLabel,
  nextChargeDate,
  subscriptionStatus,
  type SubscriptionRunResult,
  type SubscriptionStatus,
} from "@/lib/subscriptions";

/**
 * The subscriptions page (ARCHITECTURE.md).
 *
 * Note what this page is *not*: a source of spending figures. A subscription is
 * a schedule; the charges it generates are receipts, and receipts are what every
 * chart and total in the app reads. Nothing here feeds any number elsewhere.
 *
 * The **Overdue badge is the real safety net.** A subscription still showing
 * overdue a day later means the cron isn't running — surfaced in the UI you
 * actually look at, rather than only in an email you might miss.
 */
export default function SubscriptionsPage() {
  const { data, isLoading, error } = useSubscriptions();
  const { data: receiptsData } = useMergedReceipts();
  const runDue = useRunDueCharges();
  const chargeNow = useChargeSubscriptionNow();
  const updateSubscription = useUpdateSubscription();

  const [editing, setEditing] = useState<Subscription | null>(null);
  const [creating, setCreating] = useState(false);

  const subscriptions = useMemo(() => data ?? [], [data]);
  const receipts = useMemo(() => receiptsData ?? [], [receiptsData]);
  const today = todayISO();

  const generatedCount = useMemo(
    () => receipts.filter((r) => r.subscription_id != null).length,
    [receipts],
  );

  const monthlyEquivalent = useMemo(
    () =>
      subscriptions
        .filter((s) => s.active)
        .reduce((sum, s) => sum + monthlyRate(s), 0),
    [subscriptions],
  );

  async function onRunDue() {
    try {
      const result = await runDue.mutateAsync();
      toast.success(summarizeRun(result));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to run due charges",
      );
    }
  }

  async function onChargeNow(sub: Subscription) {
    try {
      const result = await chargeNow.mutateAsync(sub.id);
      toast.success(
        result.alreadyCharged
          ? `${sub.name}: ${result.date} was already recorded — counter caught up.`
          : `${sub.name}: charge recorded for ${result.date}.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to charge");
    }
  }

  async function onTogglePaused(sub: Subscription) {
    try {
      await updateSubscription.mutateAsync({
        id: sub.id,
        patch: { active: !sub.active },
      });
      toast.success(`${sub.name} ${sub.active ? "paused" : "resumed"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
  }

  const busy =
    runDue.isPending || chargeNow.isPending || updateSubscription.isPending;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">
          🔁 Subscriptions
        </h1>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onRunDue}
            disabled={busy}
            title="Write every charge that is currently due"
          >
            <Zap />
            {runDue.isPending ? "Running…" : "Run due charges"}
          </Button>
          <Button type="button" onClick={() => setCreating(true)}>
            <Plus />
            New
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load data."}
        </p>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && !error && subscriptions.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">No subscriptions yet.</p>
          <p className="mt-1">
            A subscription is a schedule that generates receipts — it pins a
            store, category and price so every future charge is filed the same
            way, without you having to remember which category it goes in.
          </p>
        </div>
      )}

      {!isLoading && subscriptions.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat
              label="Active"
              value={String(subscriptions.filter((s) => s.active).length)}
            />
            <Stat
              label="Monthly equivalent"
              value={formatCurrency(monthlyEquivalent)}
              hint="Active subscriptions, normalized to a month. Not a figure any chart uses."
            />
            <Stat
              label="Receipts generated"
              value={String(generatedCount)}
              hint="Across all time — these are ordinary receipts and count in every total."
            />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Cadence</TableHead>
                <TableHead>Next charge</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="sticky right-0 w-28 border-l border-border bg-background" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.map((s) => {
                const status = subscriptionStatus(s, today);
                return (
                  <TableRow key={s.id} className="group/row">
                    <TableCell>
                      <button
                        type="button"
                        className="block max-w-full cursor-pointer truncate text-left font-medium hover:underline"
                        onClick={() => setEditing(s)}
                        title={s.note ?? s.name}
                      >
                        {s.name}
                      </button>
                    </TableCell>
                    <TableCell>{s.store}</TableCell>
                    <TableCell>{s.category}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(s.price)}
                    </TableCell>
                    <TableCell>
                      {cadenceLabel(s.interval_unit, s.interval_count)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {s.active ? nextChargeDate(s) : "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={status} />
                    </TableCell>
                    <TableCell className="sticky right-0 border-l border-border bg-background group-hover/row:bg-muted/50">
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          disabled={busy || !s.active}
                          aria-label={`Charge ${s.name} now`}
                          title={
                            s.active
                              ? `Record the next scheduled charge (${nextChargeDate(s)})`
                              : "Paused"
                          }
                          onClick={() => onChargeNow(s)}
                        >
                          <Zap className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          disabled={busy}
                          aria-label={
                            s.active ? `Pause ${s.name}` : `Resume ${s.name}`
                          }
                          onClick={() => onTogglePaused(s)}
                        >
                          {s.active ? (
                            <Pause className="size-3.5" />
                          ) : (
                            <Play className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <p className="text-xs text-muted-foreground">
            Charges are written by a daily cron. A subscription stuck on{" "}
            <strong>Overdue </strong> for more than a day means the cron
            isn&apos;t running — that&apos;s what the badge is for. &ldquo;Run
            due charges&rdquo; does the same work by hand and is safe to press
            twice: a charge that already exists is skipped, not duplicated.
          </p>
        </>
      )}

      {(creating || editing) && (
        <SubscriptionEditor
          subscription={editing ?? undefined}
          open
          onOpenChange={(next) => {
            if (!next) {
              setCreating(false);
              setEditing(null);
            }
          }}
        />
      )}
    </div>
  );
}

/** Normalizes any cadence to an approximate monthly figure, for the header only. */
function monthlyRate(s: Subscription): number {
  const perMonth =
    s.interval_unit === "day"
      ? 30.437 / s.interval_count
      : s.interval_unit === "week"
        ? 4.348 / s.interval_count
        : s.interval_unit === "month"
          ? 1 / s.interval_count
          : 1 / (12 * s.interval_count);
  return s.price * perMonth;
}

function summarizeRun(result: SubscriptionRunResult): string {
  const parts: string[] = [];
  if (result.inserted.length > 0) {
    const total = result.inserted.reduce((sum, c) => sum + c.price, 0);
    parts.push(
      `${result.inserted.length} charge${result.inserted.length === 1 ? "" : "s"} written (${formatCurrency(total)})`,
    );
  }
  if (result.skipped.length > 0) {
    parts.push(`${result.skipped.length} already recorded`);
  }
  if (result.failed.length > 0) {
    parts.push(`${result.failed.length} failed — retried next run`);
  }
  if (result.capped.length > 0) {
    parts.push(`${result.capped.length} hit the per-run cap`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Nothing due.";
}

const STATUS_STYLE: Record<
  SubscriptionStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  active: { label: "Active", variant: "secondary" },
  due: { label: "Due", variant: "default" },
  overdue: { label: "Overdue", variant: "destructive" },
  paused: { label: "Paused", variant: "outline" },
};

function StatusBadge({ status }: { status: SubscriptionStatus }) {
  const { label, variant } = STATUS_STYLE[status];
  return (
    <Badge
      variant={variant}
      title={
        status === "overdue"
          ? "A charge is past due. If this persists for more than a day, the cron isn't running."
          : undefined
      }
    >
      {label}
    </Badge>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    // `min-w-0`: a grid track's automatic minimum is its content's min-content
    // width, so without it a long unbreakable currency string widens the
    // column and pushes the whole page sideways.
    <div
      className="min-w-0 rounded-lg border border-border bg-card p-3"
      title={hint}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}
