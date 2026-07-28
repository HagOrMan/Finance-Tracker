"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
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
  // Analysis, not data management — so it stays inline rather than joining the
  // Manage popover. That takes this row to 7 on desktop; it already scrolls
  // horizontally, but this is the one to watch if an eighth ever appears.
  { href: "/reports", label: "Reports" },
];

const MANAGE_LINKS = [
  { href: "/stores", label: "Stores & entities" },
  { href: "/manage", label: "Receipts & disbursements" },
  { href: "/subscriptions", label: "Subscriptions" },
];

/**
 * The breakpoint at which the inline link row fits.
 *
 * Measured, not guessed: the six analysis links plus "Manage" come to roughly
 * 640px of buttons, and with the wordmark, theme toggle and sign-out either
 * side the row needs ~900px. `sm` and `md` are both too narrow — below `lg`
 * the row used to scroll sideways, which on a phone meant half the app was
 * behind a gesture nothing signposted. Below `lg` it's the drawer instead.
 */
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
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 lg:gap-4">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-semibold text-foreground"
        >
          <span>{APP_ICON}</span>
          <span className="hidden sm:inline">{APP_TITLE}</span>
        </Link>

        <nav className="hidden flex-1 items-center gap-1 lg:flex">
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

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <ThemeToggle />
          {/* Sign-out moves into the drawer below `lg` — three icons crowding
              the right of a 390px bar is how you tap the wrong one. */}
          <span className="hidden lg:inline-flex">
            <SignOutButton variant="ghost" size="icon" iconOnly />
          </span>
          <MobileNav pathname={pathname} />
        </div>
      </div>
    </header>
  );
}

function MobileNav({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);

  const linkClass = (active: boolean) =>
    cn(
      // `py-3` rather than the inline row's `py-1.5`: these are the primary
      // touch targets on a phone, so they get the full 44px.
      "block rounded-md px-3 py-3 text-base font-medium transition-colors",
      active
        ? "bg-primary text-primary-foreground"
        : "text-foreground hover:bg-accent hover:text-accent-foreground",
    );

  return (
    <Drawer direction="right" open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Open menu"
          className="lg:hidden"
        >
          <Menu className="size-5" />
        </Button>
      </DrawerTrigger>
      <DrawerContent className="data-[vaul-drawer-direction=right]:w-72">
        <DrawerHeader>
          <DrawerTitle>
            {APP_ICON} {APP_TITLE}
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            Site navigation
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="flex flex-col gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={linkClass(pathname === link.href)}
            >
              {link.label}
            </Link>
          ))}

          <p className="mt-4 px-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Manage
          </p>
          {MANAGE_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={linkClass(pathname === link.href)}
            >
              {link.label}
            </Link>
          ))}

          <div className="mt-6 border-t border-border pt-4">
            <SignOutButton variant="outline" />
          </div>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
