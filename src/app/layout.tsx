import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Menu } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/app-sidebar";
import { getSettingsService } from "@/lib/api/services";
import { TimezoneInit } from "@/components/timezone-init";
import { BaseCurrencyInit } from "@/components/base-currency-init";
import { setBaseCurrencyCache, getBaseCurrency } from "@/lib/format";
import { SampleDataBar } from "@/components/sample-data-bar";
import { LazyTour } from "@/components/tour/lazy-tour";
import { hasSampleData } from "@/lib/services/sample-data";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext", "cyrillic"],
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kinti",
  description: "AI-powered personal finance tracker",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settingsService = getSettingsService();
  const timezone = settingsService.getTimezone() ?? "UTC";
  const baseCurrency = settingsService.getBaseCurrency();
  // Mirror the cache on the server side for any server components rendered
  // in this request — instrumentation runs once at boot, but a fresh DB
  // configured during this process won't have triggered it.
  if (baseCurrency) setBaseCurrencyCache(baseCurrency);
  const effectiveBaseCurrency = getBaseCurrency();
  const tutorial = settingsService.get("tutorial") === "true";
  const sampleData = hasSampleData();

  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        <TimezoneInit timezone={timezone} />
        <BaseCurrencyInit currency={effectiveBaseCurrency} />
        <LazyTour initialTutorial={tutorial} />
        <TooltipProvider>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              <div className="bg-background sticky top-0 z-10">
                <header className="relative flex h-14 items-center gap-2 border-b px-4">
                  {/* Desktop: icon-only trigger */}
                  <SidebarTrigger
                    className="hidden md:inline-flex"
                    data-testid="sidebar-trigger-desktop"
                  />
                  {/* Mobile: hamburger left-aligned */}
                  <SidebarTrigger className="md:hidden" data-testid="sidebar-trigger-mobile">
                    <Menu className="size-4" />
                    <span className="sr-only">Toggle Sidebar</span>
                  </SidebarTrigger>
                  {/* Mobile: centered Kinti branding, also opens sidebar */}
                  <SidebarTrigger className="absolute left-1/2 -translate-x-1/2 gap-2 px-0 md:hidden">
                    <span className="text-base font-bold tracking-tight">Kinti</span>
                  </SidebarTrigger>
                </header>
                <SampleDataBar show={sampleData} initiallyHidden={tutorial} />
              </div>
              <div className="flex-1 p-4 pb-20 md:p-6 md:pb-6">{children}</div>
            </SidebarInset>
          </SidebarProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
