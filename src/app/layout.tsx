import type { Metadata, Viewport } from "next";

import "./globals.css";
import { Providers } from "@/components/providers";
import { AppChrome } from "@/components/app-chrome";
import { DemoBoot } from "@/components/demo/demo-boot";
import { FiltersHydrator } from "@/components/filters-hydrator";
import { APP_TITLE } from "@/lib/config";
import { IS_DEMO } from "@/lib/demo/flag";

export const metadata: Metadata = {
  title: IS_DEMO ? `${APP_TITLE} (demo)` : APP_TITLE,
  description: "Personal finance tracker",
  // The demo must never compete with anything real in search results, and a
  // recruiter must never land on generated data believing it is production.
  // Paired with `src/app/robots.ts`, which blocks crawlers outright in demo.
  robots: IS_DEMO ? { index: false, follow: false } : undefined,
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
          {/* Wraps the chrome, not just the pages: in demo mode every surface
              reads from the demo store, including `Nav`'s links to pages that
              would immediately query it. In production this is a pass-through
              and no demo module is loaded at all. */}
          <DemoBoot>
            <AppChrome>{children}</AppChrome>
          </DemoBoot>
        </Providers>
      </body>
    </html>
  );
}
