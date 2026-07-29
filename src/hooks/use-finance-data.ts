"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import type {
  Disbursement,
  MergedReceipt,
  NewDisbursementInput,
  NewReceiptInput,
  NewSubscriptionInput,
  Receipt,
  Subscription,
  UpdateDisbursementInput,
  UpdateReceiptInput,
  UpdateSubscriptionInput,
} from "@/lib/data/types";
// From the pure modules, not the `*-runner` ones — those are `server-only`.
import type { SubscriptionRunResult } from "@/lib/subscriptions";
import type { ReportPeriod, SpendingReport } from "@/lib/reports";

/**
 * A non-2xx response, with the parsed body kept intact.
 *
 * `Error` alone loses the status code and everything the handler sent
 * alongside the message — specifically the `linked` disbursements a 409 from
 * a blocked receipt delete carries, which the UI has to render inline.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * The rows blocking a delete — a 409's `linked` payload — or `[]` for any
 * other failure.
 *
 * Two delete guards produce this shape: a receipt blocked by the refunds
 * pointing at it, and a subscription blocked by the receipts it generated. The
 * caller names the row type, since only it knows which guard it just tripped.
 */
export function linkedRows<T>(error: unknown): T[] {
  if (!(error instanceof ApiError) || error.status !== 409) return [];
  return Array.isArray(error.body.linked) ? (error.body.linked as T[]) : [];
}

/** The disbursements blocking a receipt delete. */
export function linkedDisbursements(error: unknown): Disbursement[] {
  return linkedRows<Disbursement>(error);
}

async function request<T>(
  url: string,
  init?: { method: string; input?: unknown },
): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    ...(init?.input === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(init.input),
        }),
  });
  if (!res.ok) {
    const body: Record<string, unknown> = await res
      .json()
      .catch(() => ({}));
    const message =
      typeof body.error === "string"
        ? body.error
        : `Request to ${url} failed (${res.status})`;
    throw new ApiError(message, res.status, body);
  }
  return res.json();
}

const fetchJSON = <T,>(url: string) => request<T>(url);
const postJSON = <T,>(url: string, input: unknown) =>
  request<T>(url, { method: "POST", input });
const patchJSON = <T,>(url: string, input: unknown) =>
  request<T>(url, { method: "PATCH", input });
const deleteJSON = <T,>(url: string) => request<T>(url, { method: "DELETE" });

const RECEIPTS_KEY = ["merged-receipts"];
const DISBURSEMENTS_KEY = ["disbursements"];
const SUBSCRIPTIONS_KEY = ["subscriptions"];
// Prefix, not a full key — matches every period's report at once.
const REPORTS_KEY_PREFIX = ["report"];

// No per-query `staleTime` anywhere in this file on purpose: the window is a
// single decision and it lives in `src/components/providers.tsx`, next to the
// reasoning for it.

// ---------------------------------------------------------------------------
// What each table invalidates
//
// Named once so a mutation can't half-remember the fan-out. The non-obvious
// edges, both of which used to be open-coded at every call site:
//
// - **Reports depend on both tables.** They are built server-side, so they
//   can't be recomputed from the caches above and have to be refetched. Since
//   `staleTime` went from 60s to 5 minutes, "it'll catch up shortly" stopped
//   being true.
// - **Disbursements move receipt numbers.** A refund's amount is what makes
//   `actual_price` differ from `price`, so every net-paid figure in the app
//   changes when one is written.
// ---------------------------------------------------------------------------

function invalidateReceipts(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: RECEIPTS_KEY });
  queryClient.invalidateQueries({ queryKey: REPORTS_KEY_PREFIX });
}

function invalidateDisbursements(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: DISBURSEMENTS_KEY });
  queryClient.invalidateQueries({ queryKey: RECEIPTS_KEY });
  queryClient.invalidateQueries({ queryKey: REPORTS_KEY_PREFIX });
}

function invalidateSubscriptions(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: SUBSCRIPTIONS_KEY });
}

/** A generated charge is a receipt, and it advances the counter on the sub. */
function invalidateSubscriptionCharges(queryClient: QueryClient): void {
  invalidateSubscriptions(queryClient);
  invalidateReceipts(queryClient);
}

export function useMergedReceipts() {
  return useQuery({
    queryKey: RECEIPTS_KEY,
    queryFn: () => fetchJSON<MergedReceipt[]>("/api/receipts"),
  });
}

export function useDisbursements() {
  return useQuery({
    queryKey: DISBURSEMENTS_KEY,
    queryFn: () => fetchJSON<Disbursement[]>("/api/disbursements"),
  });
}

/**
 * The "Refresh data" button — the app's only *manual* read path.
 *
 * It is deliberately not `invalidateQueries`. There are now two caches, and
 * invalidating the browser's would just refetch the same rows out of the
 * server's Data Cache: a refresh button that provably does nothing. `?fresh=1`
 * makes the handler read Postgres and drop the server entry, so one press
 * genuinely re-reads the ledger — for every other tab and device too.
 *
 * That makes it the expensive path, which is the right shape: it exists for the
 * rare case where the database was changed from outside this app (the Supabase
 * dashboard, a psql session), and nothing else can know that happened.
 */
export function useRefreshFinanceData() {
  const queryClient = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const [receipts, disbursements, subscriptions] = await Promise.all([
        fetchJSON<MergedReceipt[]>("/api/receipts?fresh=1"),
        fetchJSON<Disbursement[]>("/api/disbursements?fresh=1"),
        fetchJSON<Subscription[]>("/api/subscriptions?fresh=1"),
      ]);
      return { receipts, disbursements, subscriptions };
    },
    // Seeded rather than invalidated: the fetches above already returned the
    // authoritative rows, so re-requesting them would be a second round trip
    // for an answer we're holding.
    onSuccess: ({ receipts, disbursements, subscriptions }) => {
      queryClient.setQueryData(RECEIPTS_KEY, receipts);
      queryClient.setQueryData(DISBURSEMENTS_KEY, disbursements);
      queryClient.setQueryData(SUBSCRIPTIONS_KEY, subscriptions);
      // Reports are built server-side from the rows above and can't be seeded
      // from them; the `fresh=1` reads dropped the server entries those are
      // derived from, so a plain invalidate now rebuilds them correctly.
      queryClient.invalidateQueries({ queryKey: REPORTS_KEY_PREFIX });
    },
  });
  return { refresh: mutate, isRefreshing: isPending };
}

export function useAddReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewReceiptInput) => postJSON<Receipt>("/api/receipts", input),
    onSuccess: () => invalidateReceipts(queryClient),
  });
}

export function useAddDisbursement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewDisbursementInput) =>
      postJSON<Disbursement>("/api/disbursements", input),
    onSuccess: () => invalidateDisbursements(queryClient),
  });
}

// ---------------------------------------------------------------------------
// Edit / delete (ARCHITECTURE.md Phase 0)
//
// Deliberately no optimistic updates. Single user, and on a personal finance
// ledger a wrong-looking number that silently reverts is worse than a 200ms
// wait. Every mutation invalidates and refetches instead.
// ---------------------------------------------------------------------------

export function useUpdateReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: UpdateReceiptInput }) =>
      patchJSON<Receipt>(`/api/receipts/${id}`, patch),
    onSuccess: () => invalidateReceipts(queryClient),
  });
}

export function useBulkUpdateReceipts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, patch }: { ids: number[]; patch: UpdateReceiptInput }) =>
      patchJSON<{ updated: number; receipts: Receipt[] }>(
        "/api/receipts/bulk",
        { ids, patch },
      ),
    onSuccess: () => invalidateReceipts(queryClient),
  });
}

export function useDeleteReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      deleteJSON<{ ok: true; id: number }>(`/api/receipts/${id}`),
    onSuccess: () => invalidateReceipts(queryClient),
  });
}

export function useUpdateDisbursement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: number;
      patch: UpdateDisbursementInput;
    }) => patchJSON<Disbursement>(`/api/disbursements/${id}`, patch),
    onSuccess: () => invalidateDisbursements(queryClient),
  });
}

export function useBulkUpdateDisbursements() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      ids,
      patch,
    }: {
      ids: number[];
      patch: UpdateDisbursementInput;
    }) =>
      patchJSON<{ updated: number; disbursements: Disbursement[] }>(
        "/api/disbursements/bulk",
        { ids, patch },
      ),
    onSuccess: () => invalidateDisbursements(queryClient),
  });
}

export function useDeleteDisbursement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      deleteJSON<{ ok: true; id: number }>(`/api/disbursements/${id}`),
    onSuccess: () => invalidateDisbursements(queryClient),
  });
}

// ---------------------------------------------------------------------------
// Subscriptions (ARCHITECTURE.md Phase 3)
//
// Anything that can *generate a charge* uses
// `invalidateSubscriptionCharges` — a generated charge is a receipt, and every
// total in the app reads receipts. Edits that only touch the schedule don't.
// ---------------------------------------------------------------------------

export function useSubscriptions() {
  return useQuery({
    queryKey: SUBSCRIPTIONS_KEY,
    queryFn: () => fetchJSON<Subscription[]>("/api/subscriptions"),
  });
}

export function useAddSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewSubscriptionInput) =>
      postJSON<Subscription>("/api/subscriptions", input),
    onSuccess: () => invalidateSubscriptions(queryClient),
  });
}

export function useUpdateSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: number;
      patch: UpdateSubscriptionInput;
    }) => patchJSON<Subscription>(`/api/subscriptions/${id}`, patch),
    onSuccess: () => invalidateSubscriptions(queryClient),
  });
}

export function useDeleteSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      deleteJSON<{ ok: true; id: number }>(`/api/subscriptions/${id}`),
    onSuccess: () => invalidateSubscriptions(queryClient),
  });
}

export function useChargeSubscriptionNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      postJSON<{
        receiptId: number | null;
        date: string;
        alreadyCharged: boolean;
      }>(`/api/subscriptions/${id}/charge-now`, {}),
    onSuccess: () => invalidateSubscriptionCharges(queryClient),
  });
}

export function useRunDueCharges() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      postJSON<SubscriptionRunResult>("/api/subscriptions/run-due", {}),
    onSuccess: () => invalidateSubscriptionCharges(queryClient),
  });
}

// ---------------------------------------------------------------------------
// Spending reports (ARCHITECTURE.md)
//
// The report is fetched rather than aggregated from the two caches above, even
// though every row it needs is already in them. The reason is "today":
// `APP_TIMEZONE` is server-only, so a browser-built report would use the
// browser's zone and could disagree with the emailed one by a day at every
// window boundary. See ARCHITECTURE.md.
// ---------------------------------------------------------------------------

const REPORT_KEY = (period: ReportPeriod) => [...REPORTS_KEY_PREFIX, period];

export function useSpendingReport(period: ReportPeriod) {
  return useQuery({
    queryKey: REPORT_KEY(period),
    queryFn: () => fetchJSON<SpendingReport>(`/api/reports?period=${period}`),
    // Keeps the previous period's report on screen while the next one loads,
    // so switching tabs doesn't flash the whole page back to a skeleton.
    placeholderData: (previous) => previous,
  });
}

/**
 * Sends the report for a period.
 *
 * Deliberately invalidates nothing: sending changes no data anywhere. It posts
 * only the period — the server rebuilds the model rather than trusting numbers
 * that came from a browser.
 */
export function useSendSpendingReport() {
  return useMutation({
    mutationFn: (period: ReportPeriod) =>
      postJSON<{ sent: boolean; subject: string | null; reason?: string }>(
        "/api/reports/send",
        { period },
      ),
  });
}
