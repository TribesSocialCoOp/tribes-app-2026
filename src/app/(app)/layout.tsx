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
import { EmailVerificationBanner } from "@/components/providers/email-verification-banner";
import { VersionGuard } from "@/components/providers/version-guard";

import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { NativeInitializer } from "@/components/providers/native-initializer";
import { OverlayScrollGuard } from "@/components/providers/overlay-scroll-guard";
import { PullToRefresh } from "@/components/layout/pull-to-refresh";
import { useTheme } from "@/hooks/use-theme";
import React, { useEffect } from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Mount theme hook to ensure class is maintained after hydration
  useTheme();

  // ── Synthetic history injection (web + Capacitor) ────────────────────────
  // Problem: the / → /your-comms server redirect, and direct deep-links to
  // sub-pages, leave the app with either:
  //   A) Only one in-app history entry (/ → /your-comms) — pressing back exits
  //   B) A sub-page as the first entry — no feed in history stack at all
  //
  // Fix: on first mount of the app shell, inject a /your-comms sentinel
  // BEFORE the current page. This runs exactly ONCE per page load on ALL
  // platforms (web and Capacitor). On Capacitor, the Android back-button
  // listener in native-initializer.tsx uses history.back() and detects the
  // sentinel state to know when to exit the app.
  //
  // Why empty deps (not [pathname]):
  //   Next.js App Router monkey-patches window.history.replaceState/pushState.
  //   If we call these inside a useEffect([pathname]), Next.js detects the URL
  //   changes and updates usePathname() → the effect fires again → loop.
  //   Empty deps avoids this: replaceState + pushState happen once, then
  //   usePathname updates are SPA navigations we don't need to intercept.
  //
  // Result (web & Capacitor):
  //   /  → redirect → /your-comms:
  //     inject → history: [..., /your-comms(sentinel), /your-comms]
  //     SPA to /post/:id → [..., /your-comms(sentinel), /your-comms, /post/:id]
  //     SPA to /t/:slug  → [..., /your-comms(sentinel), /your-comms, /post/:id, /t/:slug]
  //     back×2 = /post/:id → /your-comms ✓
  //
  //   cold deep-link → /post/:id:
  //     inject → [..., /your-comms(sentinel), /post/:id]
  //     SPA to /t/:slug → [..., /your-comms(sentinel), /post/:id, /t/:slug]
  //     back×2 = /post/:id → /your-comms(sentinel) ✓
  useEffect(() => {
    if (window.location.pathname === '/') return; // will be redirected server-side

    const currentUrl = window.location.href;
    // IMPORTANT: Call History.prototype methods directly (not window.history.pushState).
    // Next.js App Router monkey-patches window.history.pushState/replaceState at the
    // instance level to intercept navigations and update its internal router state.
    // Calling the patched versions would corrupt the router: Next.js would think the
    // current route changed to '/your-comms', and subsequent router.push() calls would
    // navigate there instead of the intended URL.
    // History.prototype methods are the native browser implementations (unpatched).
    const sentinelState = {
      _tribesSentinel: true,
      as: '/your-comms',
      url: '/your-comms',
    };
    History.prototype.replaceState.call(window.history, sentinelState, '', '/your-comms');
    History.prototype.pushState.call(window.history, null, '', currentUrl);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally runs once on mount only
  }, []);

  // SidebarProvider will now manage its own open/collapsed state using cookies.

  // No need for AppLayout to maintain 'open' state for the sidebar.
  return (
    <VersionGuard>
    <UserProvider>
      <NativeInitializer />
      <OverlayScrollGuard />
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
                <div className="flex-1 px-2 pt-3 pb-4 sm:p-6 lg:p-8 md:pb-8">
                  <EmailVerificationBanner />
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

