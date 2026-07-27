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
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      <QuickAddButton />
    </>
  );
}
