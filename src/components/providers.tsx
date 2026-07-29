"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";

/**
 * Query defaults tuned for a **single-user ledger that only this app writes to**.
 *
 * TanStack's defaults assume data can change behind your back — a 0ms
 * `staleTime` plus refetch-on-focus means every alt-tab back into the app
 * re-reads the whole ledger. Here nothing can change it except a mutation in
 * this same tab, and every mutation already invalidates. So the refetch
 * triggers are off and the window is long: correctness comes from
 * invalidation, not from polling.
 *
 * The server-side half of this is `src/lib/data/cache.ts` — even a cache miss
 * here usually costs a Data Cache hit rather than a Supabase query.
 */
const queryDefaults = {
  queries: {
    // Long, because only a mutation (or the explicit Refresh button) can make
    // this data wrong, and both invalidate.
    staleTime: 5 * 60_000,
    // Survives navigating away from a page and back without a refetch.
    gcTime: 30 * 60_000,
    // The alt-tab refetch, which was the single biggest source of redundant
    // Supabase reads. Nothing changes the ledger while the tab is in the
    // background.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  },
} as const;

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: queryDefaults }),
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
