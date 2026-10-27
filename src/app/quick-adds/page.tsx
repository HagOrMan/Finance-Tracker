"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { QuickAddEditor } from "@/components/quick-add-editor";
import { useQuickAdds } from "@/hooks/use-finance-data";
import type { QuickAdd, QuickAddKind } from "@/lib/data/types";
import { formatCurrency } from "@/lib/format";

/**
 * Quick-add presets: the things you log often but not on a schedule. Each one
 * shows up as a button at the top of the matching tab in the quick-add sheet.
 *
 * Cards rather than a table — this page is managed from a phone, and every
 * preset has at most five short fields.
 */
export default function QuickAddsPage() {
  const { data, isLoading, error } = useQuickAdds();
  const [editing, setEditing] = useState<QuickAdd | null>(null);
  const [creating, setCreating] = useState(false);

  const quickAdds = useMemo(() => data ?? [], [data]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">⚡ Quick adds</h1>
        <Button type="button" onClick={() => setCreating(true)}>
          <Plus />
          New
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load data."}
        </p>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && !error && quickAdds.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">No quick adds yet.</p>
          <p className="mt-1">
            A quick add saves a store, category, amount and note you use often
            but not on a schedule — that&apos;s what Subscriptions are for. It
            appears as a button at the top of the + sheet, and tapping it fills
            the form in.
          </p>
        </div>
      )}

      {!isLoading && quickAdds.length > 0 && (
        <>
          <Section
            title="Receipts"
            kind="receipt"
            quickAdds={quickAdds}
            onEdit={setEditing}
          />
          <Section
            title="Disbursements"
            kind="disbursement"
            quickAdds={quickAdds}
            onEdit={setEditing}
          />
        </>
      )}

      {(creating || editing) && (
        <QuickAddEditor
          quickAdd={editing ?? undefined}
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

function Section({
  title,
  kind,
  quickAdds,
  onEdit,
}: {
  title: string;
  kind: QuickAddKind;
  quickAdds: QuickAdd[];
  onEdit: (quickAdd: QuickAdd) => void;
}) {
  const rows = quickAdds.filter((q) => q.kind === kind);
  if (rows.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((q) => (
          <li key={q.id} className="min-w-0">
            <button
              type="button"
              onClick={() => onEdit(q)}
              className="flex w-full min-w-0 cursor-pointer flex-col gap-0.5 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex min-w-0 items-baseline justify-between gap-2">
                <span className="truncate font-medium text-foreground">
                  {q.name}
                </span>
                <span className="shrink-0 text-sm tabular-nums text-foreground">
                  {q.amount === null ? (
                    <span className="text-muted-foreground">Amount varies</span>
                  ) : (
                    formatCurrency(q.amount)
                  )}
                </span>
              </div>
              <span className="truncate text-xs text-muted-foreground">
                {[q.counterparty, q.category, q.note].filter(Boolean).join(" · ")}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
