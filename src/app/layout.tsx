import type { Metadata } from "next";

import "./globals.css";
import { Providers } from "@/components/providers";
import { AppChrome } from "@/components/app-chrome";
import { FiltersHydrator } from "@/components/filters-hydrator";
import { APP_TITLE } from "@/lib/config";

export const metadata: Metadata = {
  title: APP_TITLE,
  description: "Personal finance tracker",
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
