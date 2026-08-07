"use client";

import { usePathname } from "next/navigation";

import { DemoBanner } from "@/components/demo/demo-banner";
import { Nav } from "@/components/nav";
import { QuickAddButton } from "@/components/quick-add-modal";

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/login" || pathname.startsWith("/auth");

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <>
      {/* Above the nav so it is the first thing read, and outside the `main`
          padding so it spans the full width. Renders nothing in production. */}
      <DemoBanner />
      <Nav />
      {/* The extra bottom padding on mobile is the quick-add button's footprint
          — without it the last table row or chart sits underneath it. */}
      <main className="mx-auto max-w-7xl px-4 py-6 max-sm:pb-28">{children}</main>
      <QuickAddButton />
    </>
  );
}
