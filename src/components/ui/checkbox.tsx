"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer border-input data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "size-4 shrink-0 cursor-pointer touch-manipulation rounded-[4px] border shadow-xs outline-none transition-shadow disabled:cursor-not-allowed disabled:opacity-50",
        // A 16px box is well under the 44px touch minimum. The `::after` ring
        // extends the hit area without taking up layout space, so nothing
        // around it shifts — it stays a 20px box that behaves like a 40px one.
        "max-sm:relative max-sm:size-5",
        "max-sm:after:absolute max-sm:after:-inset-2.5 max-sm:after:content-['']",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
