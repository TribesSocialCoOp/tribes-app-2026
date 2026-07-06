"use client";

import { SidebarProvider, SidebarInset, SidebarRail } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { PlatformFooter } from "@/components/layout/platform-footer";
import { WebSocketProvider } from "@/components/providers/websocket-provider";
import { UserProvider } from "@/components/providers/user-provider";
import { TosAcceptanceGate } from "@/components/providers/tos-acceptance-gate";
import { KeySyncProvider } from "@/components/providers/key-sync-provider";
import { AgeGateProvider } from "@/components/providers/age-gate-provider";
import { KeySyncBanner } from "@/components/providers/key-sync-banner";
import { EmailVerificationBanner } from "@/components/providers/email-verification-banner";
import { VersionGuard } from "@/components/providers/version-guard";

import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { JumpToTop } from "@/components/layout/jump-to-top";
import { NativeInitializer } from "@/components/providers/native-initializer";
import { OverlayScrollGuard } from "@/components/providers/overlay-scroll-guard";
import { PullToRefresh } from "@/components/layout/pull-to-refresh";
import { useTheme } from "@/hooks/use-theme";
import { installNavTrace } from "@/lib/nav-trace";
import { usePathname } from "next/navigation";
import React, { useEffect } from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Mount theme hook to ensure class is maintained after hydration
  useTheme();

  // A bond chat thread (/chat/<bondId>) renders as a fixed full-window shell:
  // the message list is the only scroll region and the composer is anchored to
  // the bottom of the window. The conversation LIST (/chat) keeps normal page
  // chrome. Matched here so the layout can drop padding / footer / pull-to-
  // refresh and lock the main area to the viewport height for the thread only.
  const pathname = usePathname();
  const isChatThread = /^\/chat\/[^/]+$/.test(pathname);

  // Install navigation tracer (exposes window.__navTrace for remote debugging)
  useEffect(() => { installNavTrace(); }, []);

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

  // ── Sentinel popstate guard (Firefox + non-Capacitor browsers) ───────────
  // The Capacitor backButton handler already catches the sentinel and calls
  // App.exitApp(). But on web/Firefox, the browser's native back button fires
  // popstate directly — bypassing that handler — and can navigate past the
  // sentinel into pre-app history (e.g. a /tribes visit before the app loaded).
  // When we detect the sentinel in popstate, push /your-comms back onto the
  // stack so the sentinel acts as a hard stop rather than a waypoint.
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?._tribesSentinel) {
        (window as any).__navTrace?.recordSentinelGuard(window.location.pathname);
        History.prototype.pushState.call(window.history, null, '', '/your-comms');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
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
            <AgeGateProvider>
            <SidebarProvider>
              <AppSidebar />
              <SidebarRail />
              <SidebarInset className="flex flex-col flex-1 min-h-screen">
            {isChatThread ? (
              // Full-window chat thread: same flex-1 main as the rest of the app
              // (so the global `html.capacitor-native main` bottom padding keeps
              // the composer above the tab bar), but overflow-hidden so the page
              // doesn't scroll — only the message list does. No page
              // padding/footer/pull-to-refresh, and a flex-1/min-h-0 chain (not
              // h-full) so the message area expands correctly on iOS WebKit.
              <main data-app-ready className="chat-thread-main flex flex-1 min-h-0 flex-col overflow-hidden overflow-x-hidden bg-background">
                <AppHeader />
                <div className="flex flex-1 min-h-0 flex-col">
                  {children}
                </div>
              </main>
            ) : (
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
            )}
              </SidebarInset>

              <MobileTabBar />
              <JumpToTop />
            </SidebarProvider>
            </AgeGateProvider>
          </WebSocketProvider>
        </KeySyncProvider>
      </TosAcceptanceGate>
    </UserProvider>
    </VersionGuard>
  );
}

