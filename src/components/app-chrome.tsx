"use client";

import { usePathname } from "next/navigation";

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
      <Nav />
      {/* The extra bottom padding on mobile is the quick-add button's footprint
          — without it the last table row or chart sits underneath it. */}
      <main className="mx-auto max-w-7xl px-4 py-6 max-sm:pb-28">{children}</main>
      <QuickAddButton />
    </>
  );
}
