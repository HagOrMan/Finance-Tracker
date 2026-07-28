import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // `max-sm:h-11` for a 44px touch target; the 16px font that stops iOS
        // zooming on focus is set globally in `globals.css` under
        // `@media (pointer: coarse)`. `touch-manipulation` drops the legacy
        // 300ms double-tap-to-zoom delay on the field.
        "flex h-9 w-full min-w-0 touch-manipulation rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors outline-none max-sm:h-11",
        "placeholder:text-muted-foreground",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  );
}

export { Input };
