"use client";

import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { IS_DEMO } from "@/lib/demo/flag";
import { signOut } from "@/lib/supabase/actions";

/**
 * Renders nothing in demo mode.
 *
 * There is no session to end — the demo never signs in — so a "Sign out"
 * control would be a lie, and pressing it would invoke the `signOut` Server
 * Action, which builds a Supabase client from credentials the demo build does
 * not have. "Start over" is the demo's real equivalent, and it already exists
 * as **Reset demo** in `DemoBanner`; two controls doing one thing under two
 * names is worse than one honest control.
 */
export function SignOutButton({
  variant = "outline",
  size = "default",
  iconOnly = false,
}: {
  variant?: "outline" | "ghost";
  size?: "default" | "icon";
  iconOnly?: boolean;
}) {
  if (IS_DEMO) return null;

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
