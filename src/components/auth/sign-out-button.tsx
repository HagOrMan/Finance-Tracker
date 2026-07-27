"use client";

import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/supabase/actions";

export function SignOutButton({
  variant = "outline",
  size = "default",
  iconOnly = false,
}: {
  variant?: "outline" | "ghost";
  size?: "default" | "icon";
  iconOnly?: boolean;
}) {
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={iconOnly ? undefined : "w-full"}
      onClick={() => signOut()}
      // Only the icon-only variant needs a name; the full one already reads
      // "Sign out" on screen, and Button mirrors aria-label into a tooltip.
      aria-label={iconOnly ? "Sign out" : undefined}
    >
      <LogOut />
      {!iconOnly && "Sign out"}
    </Button>
  );
}
