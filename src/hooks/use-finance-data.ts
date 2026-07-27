"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  Disbursement,
  MergedReceipt,
  NewDisbursementInput,
  NewReceiptInput,
  Receipt,
} from "@/lib/data/types";

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request to ${url} failed (${res.status})`);
  }
  return res.json();
}

async function postJSON<T>(url: string, input: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request to ${url} failed (${res.status})`);
  }
  return res.json();
}

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
