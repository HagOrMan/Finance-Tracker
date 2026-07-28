"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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

export function useMergedReceipts() {
  return useQuery({
    queryKey: RECEIPTS_KEY,
    queryFn: () => fetchJSON<MergedReceipt[]>("/api/receipts"),
    staleTime: 60_000,
  });
}

export function useDisbursements() {
  return useQuery({
    queryKey: DISBURSEMENTS_KEY,
    queryFn: () => fetchJSON<Disbursement[]>("/api/disbursements"),
    staleTime: 60_000,
  });
}

// Mirrors the old app's "🔄 Refresh" button: clears cached data and refetches.
export function useRefreshFinanceData() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: RECEIPTS_KEY });
    queryClient.invalidateQueries({ queryKey: DISBURSEMENTS_KEY });
  };
}

export function useAddReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewReceiptInput) => postJSON<Receipt>("/api/receipts", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RECEIPTS_KEY });
    },
  });
}

export function useAddDisbursement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewDisbursementInput) =>
      postJSON<Disbursement>("/api/disbursements", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DISBURSEMENTS_KEY });
      // A refund disbursement changes the linked receipt's actual_price.
      queryClient.invalidateQueries({ queryKey: RECEIPTS_KEY });
    },
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RECEIPTS_KEY });
    },
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RECEIPTS_KEY });
    },
  });
}

export function useDeleteReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      deleteJSON<{ ok: true; id: number }>(`/api/receipts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RECEIPTS_KEY });
    },
  });
}

// Disbursement mutations invalidate BOTH keys: a refund's amount feeds
// `actual_price` through mergeReceipts, so changing one silently changes every
// net-paid figure in the app.

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DISBURSEMENTS_KEY });
      queryClient.invalidateQueries({ queryKey: RECEIPTS_KEY });
    },
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DISBURSEMENTS_KEY });
      queryClient.invalidateQueries({ queryKey: RECEIPTS_KEY });
    },
  });
}

export function useDeleteDisbursement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      deleteJSON<{ ok: true; id: number }>(`/api/disbursements/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DISBURSEMENTS_KEY });
      queryClient.invalidateQueries({ queryKey: RECEIPTS_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Subscriptions (ARCHITECTURE.md Phase 3)
//
// Anything that can *generate a charge* invalidates RECEIPTS_KEY as well as
// SUBSCRIPTIONS_KEY — a generated charge is a receipt, and every total in the
// app reads receipts. Edits that only touch the schedule don't need to.
// ---------------------------------------------------------------------------

export function useSubscriptions() {
  return useQuery({
    queryKey: SUBSCRIPTIONS_KEY,
    queryFn: () => fetchJSON<Subscription[]>("/api/subscriptions"),
    staleTime: 60_000,
  });
}

export function useAddSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewSubscriptionInput) =>
      postJSON<Subscription>("/api/subscriptions", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUBSCRIPTIONS_KEY });
    },
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUBSCRIPTIONS_KEY });
    },
  });
}

export function useDeleteSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      deleteJSON<{ ok: true; id: number }>(`/api/subscriptions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUBSCRIPTIONS_KEY });
    },
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUBSCRIPTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: RECEIPTS_KEY });
    },
  });
}

export function useRunDueCharges() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      postJSON<SubscriptionRunResult>("/api/subscriptions/run-due", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUBSCRIPTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: RECEIPTS_KEY });
    },
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

const REPORT_KEY = (period: ReportPeriod) => ["report", period];

export function useSpendingReport(period: ReportPeriod) {
  return useQuery({
    queryKey: REPORT_KEY(period),
    queryFn: () => fetchJSON<SpendingReport>(`/api/reports?period=${period}`),
    staleTime: 60_000,
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
