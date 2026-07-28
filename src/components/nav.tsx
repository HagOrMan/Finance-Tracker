"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { APP_ICON, APP_TITLE } from "@/lib/config";

// Analysis pages stay inline; data-management pages live behind the "Manage"
// popover (FEATURES.md §7.1). Nine links in one scrolling row overflows on
// desktop, and the two groups are different intents anyway — one asks "what did
// I spend", the other "what is wrong with my data".
const NAV_LINKS = [
  { href: "/", label: "Overview" },
  { href: "/daily", label: "Daily" },
  { href: "/monthly", label: "Monthly" },
  { href: "/categories", label: "Categories" },
  { href: "/savings", label: "Savings" },
  { href: "/disbursements", label: "Disbursements" },
];

// Phase 3 adds "Subscriptions" (/subscriptions) here. Listing it before the
// route exists would just be a 404 in the menu.
const MANAGE_LINKS = [
  { href: "/stores", label: "Stores & entities" },
  { href: "/manage", label: "Receipts & disbursements" },
];

export function Nav() {
  const pathname = usePathname();
  const [manageOpen, setManageOpen] = useState(false);
  const manageActive = MANAGE_LINKS.some((l) => pathname === l.href);

  const linkClass = (active: boolean) =>
    cn(
      "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
      active
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
    );

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
              className={linkClass(pathname === link.href)}
            >
              {link.label}
            </Link>
          ))}

          <Popover open={manageOpen} onOpenChange={setManageOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                // The trigger carries the active highlight whenever any child
                // route is open, so the current page is still findable while
                // the menu is closed.
                className={cn(linkClass(manageActive), "h-auto gap-1")}
              >
                Manage
                <ChevronDown className="size-3.5 opacity-70" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-1">
              {MANAGE_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setManageOpen(false)}
                  className={cn(
                    "block rounded-sm px-3 py-2 text-sm font-medium transition-colors",
                    pathname === link.href
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </PopoverContent>
          </Popover>
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          <ThemeToggle />
          <SignOutButton variant="ghost" size="icon" iconOnly />
        </div>
      </div>
    </header>
  );
}
