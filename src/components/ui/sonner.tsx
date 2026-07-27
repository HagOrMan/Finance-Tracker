"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // A toast used to be dismissible only by swiping or waiting it out.
      closeButton
      // Sonner's default bottom-right corner is exactly where the quick-add
      // button sits, and a toast (z-index 999999999) swallowed its clicks.
      // Lift the stack clear of the button: 1.5rem inset + 3.5rem button.
      offset={{ bottom: "5.75rem", right: "1.5rem" }}
      mobileOffset={{ bottom: "5.75rem", right: "1rem", left: "1rem" }}
      style={
        {
          // These must be *complete* colors. `var(--popover)` is only the HSL
          // components ("180 60% 98%"), so sonner's `background: var(--normal-bg)`
          // was an invalid declaration and computed to `transparent` — which is
          // why toasts looked washed out and unreadable. The `--color-*` twins
          // are the `hsl()`-wrapped ones (same rule as the charts).
          "--normal-bg": "var(--color-popover)",
          "--normal-text": "var(--color-popover-foreground)",
          "--normal-border": "var(--color-border)",
          // Only read by sonner's dark-theme close-button hover rules.
          "--normal-bg-hover": "var(--color-accent)",
          "--normal-border-hover": "var(--color-ring)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          // `!` because sonner styles these off `[data-sonner-toast][data-styled]`,
          // which outranks a bare utility class.
          toast: "border-2! shadow-xl!",
          success: "border-primary!",
          error: "border-destructive!",
          title: "font-medium",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
