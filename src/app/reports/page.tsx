"use client";

import { useMemo, useState } from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SpendingReportView } from "@/components/report/spending-report-view";
import { useCategoryColors } from "@/hooks/use-category-colors";
import {
  useMergedReceipts,
  useSendSpendingReport,
  useSpendingReport,
} from "@/hooks/use-finance-data";
import { REPORT_PERIODS } from "@/lib/config";
import { isReportPeriod, REPORT_PERIOD_VALUES, type ReportPeriod } from "@/lib/reports";

/**
 * Spending reports (REPORTS.md §5).
 *
 * **Deliberately no `FilterBar`.** Every other analysis page is a lens over a
 * date range; this one's window is defined by its period, and a date filter on
 * top of that would produce a "week" that isn't seven days.
 *
 * The report is fetched rather than aggregated from the caches this page
 * already holds — see §4.4. The short version: `APP_TIMEZONE` is server-only,
 * so a browser-built report would use the browser's zone and could show a
 * different week than the one that gets mailed.
 */
export default function ReportsPage() {
  const [period, setPeriod] = useState<ReportPeriod>("week");
  const {
    data: report,
    isLoading,
    isPlaceholderData,
    error,
  } = useSpendingReport(period);
  const sendReport = useSendSpendingReport();

  // The colour map is built over EVERY category in the ledger, not just the
  // ones in the report window — `useCategoryColors` assigns by alphabetical
  // index over the set it's given, so narrowing it would recolour categories
  // relative to `/monthly` and `/categories`. Same rule the email follows.
  const { data: receiptsData } = useMergedReceipts();
  const allCategories = useMemo(
    () => (receiptsData ?? []).map((r) => r.category),
    [receiptsData],
  );
  const colorMap = useCategoryColors(allCategories);

  async function onSend() {
    try {
      const result = await sendReport.mutateAsync(period);
      toast.success(`Sent — “${result.subject}”`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to send the report",
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">
          📊 Spending reports
        </h1>
        <Button
          type="button"
          variant="outline"
          onClick={onSend}
          // Also disabled on stale data: the server would rebuild for the right
          // period anyway, but a button that sends something other than what is
          // on screen is a button that will eventually surprise someone.
          disabled={sendReport.isPending || !report || isPlaceholderData}
          title="Emails exactly the report shown below"
        >
          <Mail />
          {sendReport.isPending ? "Sending…" : "Send to email"}
        </Button>
      </div>

      <Tabs
        value={period}
        onValueChange={(next) => {
          if (isReportPeriod(next)) setPeriod(next);
        }}
      >
        <TabsList>
          {REPORT_PERIOD_VALUES.map((value) => (
            <TabsTrigger key={value} value={value}>
              {REPORT_PERIODS[value].label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* One `TabsContent` per period, even though all three render the same
            JSX: Radix points each trigger's `aria-controls` at the panel for
            its value, so omitting the panels would leave two of the three
            triggers referencing elements that don't exist. Only the active one
            mounts, and `period` state is what actually drives the query. */}
        {REPORT_PERIOD_VALUES.map((value) => (
          <TabsContent key={value} value={value} className="mt-4 flex flex-col gap-6">
            <p className="text-xs text-muted-foreground">
              Every window is the {REPORT_PERIODS[value].days} days ending
              yesterday, so nothing here counts a day that is still being spent.
              This is exactly what gets emailed — the page and the email render
              the same object.
            </p>

            {error && (
              <p className="text-sm text-destructive">
                {error instanceof Error
                  ? error.message
                  : "Failed to build the report."}
              </p>
            )}

            {/* `placeholderData` keeps the previous period on screen while the
                next one loads, so this only shows on the very first render. */}
            {isLoading && !report && (
              <p className="text-sm text-muted-foreground">Building report…</p>
            )}

            {report && (
              // `placeholderData` keeps the outgoing period's report mounted
              // under the incoming tab label for a moment. Dimming it says
              // "still loading" instead of letting month figures read as this
              // week's.
              <div
                className={
                  isPlaceholderData
                    ? "opacity-50 transition-opacity"
                    : "transition-opacity"
                }
                aria-busy={isPlaceholderData}
              >
                <SpendingReportView report={report} colorMap={colorMap} />
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <p className="text-xs text-muted-foreground">
        A weekly report is emailed every Saturday morning by the same cron that
        writes subscription charges. It is sent whether or not you spent
        anything — a silent Saturday means the cron isn&rsquo;t running, which is
        the only warning this feature has. Missing one is harmless: nothing is
        stored, so re-sending here rebuilds it from the ledger.
      </p>
    </div>
  );
}
