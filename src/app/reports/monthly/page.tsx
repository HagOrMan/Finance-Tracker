"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { toast } from "sonner";

import { MonthlyDigestView } from "@/components/report/monthly-digest-view";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCategoryColors } from "@/hooks/use-category-colors";
import {
  useMergedReceipts,
  useMonthlyDigest,
  useSendMonthlyDigest,
} from "@/hooks/use-finance-data";
import { addMonthsToKey, monthKeyOf } from "@/lib/dates";
import { formatMonthLong } from "@/lib/monthly-digest";

/**
 * How many months the picker offers. Long enough to reach back through a full
 * academic year and the summer before it; short enough that the list stays a
 * list rather than a scroll.
 */
const MAX_PICKER_MONTHS = 24;

/**
 * The monthly digest (ARCHITECTURE.md).
 *
 * **A second lens, not a fourth period** — `/reports` answers "how was the last
 * N days", this answers "what did last month cost and what should I expect
 * next". They are separate routes because they need different controls: a
 * period tab strip there, a month picker here.
 *
 * The month picker is the one thing the email structurally cannot offer, and
 * the projection is worth consulting mid-month rather than only when it lands.
 *
 * **Deliberately no `FilterBar`**, same as `/reports`: the window is a calendar
 * month by definition, and a date filter on top of that would produce a "month"
 * that isn't one.
 */
export default function MonthlyDigestPage() {
  // `undefined` means "whatever the server considers the newest complete month".
  // It is not derived here on purpose — `APP_TIMEZONE` is server-only, so on the
  // 1st a browser could disagree about which month just ended.
  const [month, setMonth] = useState<string | undefined>(undefined);
  const {
    data: digest,
    isLoading,
    isPlaceholderData,
    error,
  } = useMonthlyDigest(month);
  const sendDigest = useSendMonthlyDigest();

  // Captured from the first unparameterised response, which is the only one
  // that can tell us what "latest" is without guessing at a timezone.
  const [latestMonth, setLatestMonth] = useState<string | null>(null);
  useEffect(() => {
    if (month === undefined && digest) setLatestMonth(digest.month);
  }, [month, digest]);

  // The colour map is built over EVERY category in the ledger, not just this
  // month's — `useCategoryColors` assigns by alphabetical index over the set
  // it's given, so narrowing it would recolour categories relative to
  // `/monthly` and the email. Same rule every other surface follows.
  const { data: receiptsData } = useMergedReceipts();
  const allCategories = useMemo(
    () => (receiptsData ?? []).map((r) => r.category),
    [receiptsData],
  );
  const colorMap = useCategoryColors(allCategories);

  // The ledger's earliest month, so the picker can't offer a month that
  // predates every receipt and renders as a page of dashes.
  const earliestMonth = useMemo(() => {
    let min: string | null = null;
    for (const receipt of receiptsData ?? []) {
      if (min === null || receipt.date < min) min = receipt.date;
    }
    return min === null ? null : monthKeyOf(min);
  }, [receiptsData]);

  const monthOptions = useMemo(() => {
    if (!latestMonth) return [];
    const options: string[] = [];
    for (let i = 0; i < MAX_PICKER_MONTHS; i += 1) {
      const key = addMonthsToKey(latestMonth, -i);
      if (earliestMonth && key < earliestMonth) break;
      options.push(key);
    }
    return options;
  }, [latestMonth, earliestMonth]);

  const selected = digest?.month ?? latestMonth ?? "";

  async function onSend() {
    if (!digest) return;
    try {
      const result = await sendDigest.mutateAsync(digest.month);
      toast.success(`Sent — “${result.subject}”`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to send the digest",
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground">
            🗓️ Monthly digest
          </h1>
          <Link
            href="/reports"
            className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            Weekly, monthly and yearly reports
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {monthOptions.length > 0 && (
            <Select
              value={selected}
              onValueChange={(next) => setMonth(next)}
              disabled={sendDigest.isPending}
            >
              <SelectTrigger className="w-44" aria-label="Month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((key) => (
                  <SelectItem key={key} value={key}>
                    {formatMonthLong(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={onSend}
            // Also disabled on stale data: the server rebuilds for the right
            // month anyway, but a button that sends something other than what
            // is on screen is a button that will eventually surprise someone.
            disabled={sendDigest.isPending || !digest || isPlaceholderData}
            title="Emails exactly the digest shown below"
          >
            <Mail />
            {sendDigest.isPending ? "Sending…" : "Send to email"}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        A completed calendar month, so nothing here counts a day still being
        spent. This is exactly what gets emailed — the page and the email render
        the same object.
      </p>

      {error && (
        <p className="text-sm text-destructive">
          {error instanceof Error
            ? error.message
            : "Failed to build the digest."}
        </p>
      )}

      {isLoading && !digest && (
        <p className="text-sm text-muted-foreground">Building digest…</p>
      )}

      {digest && (
        // `placeholderData` keeps the outgoing month mounted under the incoming
        // label for a moment. Dimming says "still loading" rather than letting
        // June's figures read as July's.
        <div
          className={
            isPlaceholderData
              ? "opacity-50 transition-opacity"
              : "transition-opacity"
          }
          aria-busy={isPlaceholderData}
        >
          <MonthlyDigestView digest={digest} colorMap={colorMap} />
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        The digest is emailed on the 3rd of each month by the same cron that
        writes subscription charges — the 3rd rather than the 1st so receipts
        entered a day or two late still make it in. It is sent whether or not
        anything happened; a silent month means the cron isn&rsquo;t running.
        Missing one is harmless: nothing is stored, so re-sending here rebuilds
        it from the ledger.
      </p>
    </div>
  );
}
