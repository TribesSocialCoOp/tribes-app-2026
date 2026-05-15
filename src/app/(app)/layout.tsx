"use client";

import { SidebarProvider, SidebarInset, SidebarRail } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { PlatformFooter } from "@/components/layout/platform-footer";
import { WebSocketProvider } from "@/components/providers/websocket-provider";
import { UserProvider } from "@/components/providers/user-provider";
import { TosAcceptanceGate } from "@/components/providers/tos-acceptance-gate";
import { KeySyncProvider } from "@/components/providers/key-sync-provider";
import { KeySyncBanner } from "@/components/providers/key-sync-banner";
import { VersionGuard } from "@/components/providers/version-guard";

import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { NativeInitializer } from "@/components/providers/native-initializer";
import { PullToRefresh } from "@/components/layout/pull-to-refresh";
import { useTheme } from "@/hooks/use-theme";
import React from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Mount theme hook to ensure class is maintained after hydration
  useTheme();

  // SidebarProvider will now manage its own open/collapsed state using cookies.
  // No need for AppLayout to maintain 'open' state for the sidebar.
  return (
    <VersionGuard>
    <UserProvider>
      <NativeInitializer />
      <TosAcceptanceGate>
        <KeySyncProvider>
          <WebSocketProvider>
            <SidebarProvider>
              <AppSidebar />
              <SidebarRail />
              <SidebarInset className="flex flex-col flex-1 min-h-screen">
                <main data-app-ready className="flex-1 overflow-y-auto overflow-x-hidden bg-background flex flex-col">
                  <AppHeader />
                  <PullToRefresh>
                    <div className="flex-1 px-2 pt-3 pb-28 sm:p-6 lg:p-8 md:pb-8">
                      <KeySyncBanner />
                      {children}
                    </div>
                    <PlatformFooter />
                  </PullToRefresh>
                </main>
              </SidebarInset>

              <MobileTabBar />
            </SidebarProvider>
          </WebSocketProvider>
        </KeySyncProvider>
      </TosAcceptanceGate>
    </UserProvider>
    </VersionGuard>
  );
}
