"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { APP_ICON, APP_TITLE } from "@/lib/config";

const NAV_LINKS = [
  { href: "/", label: "Overview" },
  { href: "/daily", label: "Daily" },
  { href: "/monthly", label: "Monthly" },
  { href: "/categories", label: "Categories" },
  { href: "/savings", label: "Savings" },
  { href: "/disbursements", label: "Disbursements" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/75">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-semibold text-foreground"
        >
          <span>{APP_ICON}</span>
          <span className="hidden sm:inline">{APP_TITLE}</span>
        </Link>
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                pathname === link.href
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          <ThemeToggle />
          <SignOutButton variant="ghost" size="icon" iconOnly />
        </div>
      </div>
    </header>
  );
}
