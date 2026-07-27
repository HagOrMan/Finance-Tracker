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
      aria-label="Sign out"
    >
      <LogOut />
      {!iconOnly && "Sign out"}
    </Button>
  );
}
