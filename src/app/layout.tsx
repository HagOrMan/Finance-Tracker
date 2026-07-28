import type { Metadata, Viewport } from "next";

import "./globals.css";
import { Providers } from "@/components/providers";
import { AppChrome } from "@/components/app-chrome";
import { FiltersHydrator } from "@/components/filters-hydrator";
import { APP_TITLE } from "@/lib/config";

export const metadata: Metadata = {
  title: APP_TITLE,
  description: "Personal finance tracker",
};

/**
 * Next's default is `width=device-width, initial-scale=1`; this spells it out so
 * the two mobile-specific bits are explicit and don't get lost:
 *
 * - `maximumScale: 5` — pinch-zoom stays available. The iOS focus-zoom problem
 *   is fixed properly, by making touch-device inputs 16px in `globals.css`,
 *   rather than by locking scale to 1 and taking zoom away from everyone.
 * - `viewportFit: "cover"` — lets the fixed quick-add button and the bottom of
 *   the drawer pad themselves against the home indicator via `env(safe-area-*)`.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-svh bg-background text-foreground antialiased">
        <Providers>
          <FiltersHydrator />
          <AppChrome>{children}</AppChrome>
        </Providers>
      </body>
    </html>
  );
}
