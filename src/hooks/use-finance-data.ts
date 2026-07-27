"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  Disbursement,
  MergedReceipt,
  NewDisbursementInput,
  NewReceiptInput,
  Receipt,
  UpdateDisbursementInput,
  UpdateReceiptInput,
} from "@/lib/data/types";

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

/** The rows blocking a receipt delete, or `[]` for any other failure. */
export function linkedDisbursements(error: unknown): Disbursement[] {
  if (!(error instanceof ApiError) || error.status !== 409) return [];
  return Array.isArray(error.body.linked)
    ? (error.body.linked as Disbursement[])
    : [];
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
// Edit / delete (FEATURES.md Phase 0)
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
