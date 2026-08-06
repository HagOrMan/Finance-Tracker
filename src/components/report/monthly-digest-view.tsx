"use client";

import type { ReactNode } from "react";

import { DigestBigSpenders } from "@/components/report/digest-big-spenders";
import { DigestGrid } from "@/components/report/digest-grid";
import { DigestProjection } from "@/components/report/digest-projection";
import { ProportionBar } from "@/components/report/proportion-bar";
import { formatCurrency } from "@/lib/format";
import {
  changeDriverLabel,
  formatCompact,
  formatMonthLong,
  type MonthlyDigest,
} from "@/lib/monthly-digest";
import { cn } from "@/lib/utils";

/** Matches the email's caps so the two surfaces show the same rows. */
const MAX_CHANGE_ROWS = 6;
const MAX_QUIET_WINS = 4;

/**
 * A whole monthly digest, rendered.
 *
 * Takes a `MonthlyDigest` and a colour map and **nothing else** — no hooks, no
 * fetching — for the same reason `SpendingReportView` does: it lets the same
 * component render a live digest, a stale one, or a hand-built fixture, and it
 * keeps the page responsible for where the data came from.
 *
 * Section order matches the email exactly (ARCHITECTURE.md). Net first because
 * it is the question the digest exists to answer; the projection before the
 * income and store breakdowns because it is the part you act on.
 */
export function MonthlyDigestView({
  digest,
  colorMap,
}: {
  digest: MonthlyDigest;
  colorMap: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Headline digest={digest} />

      <Section
        title="Big spenders"
        hint="Anything over the floor, unusually large for its own category, or a big share of the month. Rent, school and travel live here rather than in a section of their own — they'd otherwise appear in two tables."
      >
        <DigestBigSpenders digest={digest} />
      </Section>

      <Section title="Where it goes, month by month">
        <DigestGrid digest={digest} colorMap={colorMap} />
      </Section>

      <Section title="What to expect">
        <DigestProjection digest={digest} />
      </Section>

      <Section title="What came in">
        <Income digest={digest} />
      </Section>

      <Movers digest={digest} />

      <Section
        title="Where the money went"
        hint="Habitual spend only — all-in would rank your landlord first every month."
      >
        <TopStores digest={digest} />
      </Section>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </section>
  );
}

/**
 * Net position, with habitual and all-in directly beneath it.
 *
 * **Net is the headline, not habitual spend.** Habitual alone can't say how much
 * of a year's savings the year is consuming, which is the question that decides
 * anything. The two figures the weekly report leads with are still here, one
 * line down — nothing was removed to make room.
 */
function Headline({ digest }: { digest: MonthlyDigest }) {
  const { net, received, allInSpent } = digest.net;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Net for {formatMonthLong(digest.month)}
      </div>
      <div
        className={cn(
          "mt-1 text-4xl font-semibold tabular-nums",
          // Positive is money left over, so it is the good direction here — the
          // opposite of `ReportChange`, where up means more spending.
          net > 0 && "text-primary",
          net < 0 && "text-destructive",
          net === 0 && "text-foreground",
        )}
      >
        {formatCurrency(net)}
      </div>
      <div className="mt-1 text-sm text-muted-foreground tabular-nums">
        {formatCurrency(received)} in · {formatCurrency(allInSpent)} out ·{" "}
        {digest.days} days
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-border pt-4 sm:grid-cols-2">
        <Stat
          label="Habitual spend"
          value={formatCurrency(digest.habitual.spent)}
          hint={`${digest.habitual.receiptCount} receipt${
            digest.habitual.receiptCount === 1 ? "" : "s"
          } · what you control`}
        />
        <Stat
          label="Rent, school, travel"
          value={formatCurrency(digest.excluded.spent)}
          hint="Held out of every average"
        />
        <Stat
          label="All-in spend"
          value={formatCurrency(allInSpent)}
          hint="Everything, before income"
        />
        <Stat
          label="Saved on discounts"
          value={formatCurrency(digest.savings.month)}
          hint={`${formatCurrency(digest.savings.yearToDate)} so far this year`}
        />
      </dl>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-sm text-muted-foreground">
        {label}
        <div className="text-xs text-muted-foreground/80">{hint}</div>
      </dt>
      <dd className="shrink-0 font-medium tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}

/**
 * Disbursements not linked to a receipt — the part-time income.
 *
 * Unlinked only: a linked disbursement is a refund, and a refund already came
 * off the spending figures. Counting it here would report the same dollar twice.
 */
function Income({ digest }: { digest: MonthlyDigest }) {
  const { income } = digest;

  if (income.count === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        No disbursements recorded this month.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <dl className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4 text-sm">
        {income.entities.map((entity) => (
          <div
            key={entity.name}
            className="flex items-baseline justify-between gap-4"
          >
            <dt className="truncate text-foreground" title={entity.name}>
              {entity.name}
              <span className="ml-2 text-xs text-muted-foreground">
                {entity.count} disbursement{entity.count === 1 ? "" : "s"}
              </span>
            </dt>
            <dd className="shrink-0 tabular-nums text-foreground">
              {formatCurrency(entity.total)}
            </dd>
          </div>
        ))}
        <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-border pt-2 font-semibold">
          <dt className="text-foreground">Total</dt>
          <dd className="shrink-0 tabular-nums text-foreground">
            {formatCurrency(income.total)}
          </dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        Refunds are excluded — they already came off the spending figures. Never
        projected forward: term-time hours differ too much from summer for an
        average to mean anything.
      </p>
    </div>
  );
}

function TopStores({ digest }: { digest: MonthlyDigest }) {
  if (digest.topStores.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        No habitual spending this month.
      </div>
    );
  }

  const max = digest.topStores[0]!.total;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      {digest.topStores.map((store) => (
        <div key={store.name} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="truncate text-foreground" title={store.name}>
              {store.name}
            </span>
            <span className="shrink-0 font-medium tabular-nums text-foreground">
              {formatCurrency(store.total)}
            </span>
          </div>
          <ProportionBar
            value={store.total}
            max={max}
            color="var(--color-primary)"
            label={`${store.name} — ${formatCurrency(store.total)} over ${store.count} visits`}
          />
          <span className="text-xs text-muted-foreground">
            {store.count} visit{store.count === 1 ? "" : "s"}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * What moved, and *why* it moved.
 *
 * The frequency-versus-ticket split is the actionable half: you can't decide to
 * spend less per meal, but you can decide to go one fewer time. One-offs are
 * stripped from both sides so a single brake job doesn't read as a ruinous rise
 * in average ticket — it has its own table.
 */
function Movers({ digest }: { digest: MonthlyDigest }) {
  const changes = digest.changes.slice(0, MAX_CHANGE_ROWS);
  const wins = digest.quietWins.slice(0, MAX_QUIET_WINS);
  const eating = digest.eatingOut;

  if (changes.length === 0 && wins.length === 0 && !eating) return null;

  return (
    <Section title="What moved">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        {changes.length > 0 && (
          <dl className="flex flex-col gap-2 text-sm">
            {changes.map((row) => {
              const up = row.deltaSpent >= 0;
              return (
                <div
                  key={row.category}
                  className="flex items-baseline justify-between gap-4"
                >
                  <dt className="truncate text-foreground" title={row.category}>
                    {row.category}
                    <div className="text-xs text-muted-foreground">
                      {changeDriverLabel(row)} · {row.receiptCount} vs{" "}
                      {row.baselineCount.toFixed(1)} typical
                    </div>
                  </dt>
                  <dd
                    className={cn(
                      "shrink-0 font-medium tabular-nums",
                      up ? "text-destructive" : "text-primary",
                    )}
                  >
                    {up ? "+" : "−"}
                    {formatCompact(Math.abs(row.deltaSpent))}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}

        {wins.length > 0 && (
          <p className="border-t border-border pt-3 text-sm text-muted-foreground">
            <span className="font-medium text-primary">Quiet wins</span> —{" "}
            {wins
              .map(
                (win) =>
                  `${win.category} ${formatCompact(Math.abs(win.delta))} under`,
              )
              .join(", ")}
          </p>
        )}

        {eating && eating.stressedShare !== null && (
          <div className="border-t border-border pt-3 text-sm text-muted-foreground">
            Eating out was {Math.round(eating.stressedShare * 100)}% stressed,{" "}
            {Math.round((1 - eating.stressedShare) * 100)}% social
            {eating.baselineStressedShare !== null &&
              ` — typically ${Math.round(eating.baselineStressedShare * 100)}% stressed`}
            .
            <div className="text-xs text-muted-foreground/80 tabular-nums">
              {formatCurrency(eating.stressed)} stressed ·{" "}
              {formatCurrency(eating.social)} social
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
