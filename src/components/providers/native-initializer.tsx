"use client";

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { isNative } from '@/lib/capacitor/platform';
import { initDeepLinks } from '@/lib/capacitor/deep-links';
import { syncStatusBarStyle } from '@/lib/capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

/**
 * The canonical hostnames that should be treated as internal navigation.
 * Links to these hosts get routed through Next.js router.push() instead of
 * triggering a full page navigation (which on Capacitor would reload the
 * WebView or bounce out to Safari).
 */
const INTERNAL_HOSTS = new Set(['tribes.app', 'www.tribes.app']);

import { useUser } from '@/hooks/use-user';

export function NativeInitializer() {
  const router = useRouter();
  const { role, isLoading } = useUser();

  // ── Global internal-link interceptor ───────────────────────────────────────
  // Catches clicks on ANY <a> tag pointing to tribes.app and routes them
  // through Next.js for a smooth SPA transition — no full reload, no Safari.
  const handleGlobalClick = useCallback(
    (e: MouseEvent) => {
      // Don't intercept if modifier keys are held (user wants new tab, etc.)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as Element)?.closest?.('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href) return;

      try {
        const url = new URL(href, window.location.origin);

        // Check if the link points to our own app
        const isInternal =
          INTERNAL_HOSTS.has(url.hostname) ||
          url.hostname === window.location.hostname;

        if (!isInternal) return;

        // Don't intercept links to API routes or static files
        if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/')) return;

        e.preventDefault();
        e.stopPropagation();

        const path = url.pathname + url.search + url.hash;
        console.log('[link-intercept] Internal navigation:', path);
        router.push(path);
      } catch {
        // Malformed URL — let the browser handle it normally
      }
    },
    [router],
  );

  // Mount the global interceptor (runs on both web and native)
  useEffect(() => {
    document.addEventListener('click', handleGlobalClick, true);
    return () => document.removeEventListener('click', handleGlobalClick, true);
  }, [handleGlobalClick]);

  // ── Native-only setup ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isNative) return;

    // 1. Initialize deep links
    initDeepLinks(router);

    // 1b. Initialize WebAuthn Passkey auto-shim (Option B) for Android & iOS
    const cap = (window as any).Capacitor;
    const platformName = cap?.getPlatform?.();
    if (platformName === 'android' || platformName === 'ios') {
      import('@capgo/capacitor-passkey')
        .then(async ({ CapacitorPasskey }) => {
          console.log(`[passkey] Initializing WebAuthn auto-shim for ${platformName}...`);
          await CapacitorPasskey.autoShimWebAuthn();
        })
        .catch(err => {
          console.error('[passkey] Failed to load/init CapacitorPasskey plugin:', err);
        });
    }

    // 2. Sync status bar with current theme and listen for changes
    const updateStatusBar = () => {
      const isDark = document.documentElement.classList.contains('dark');
      syncStatusBarStyle(isDark);
    };
    updateStatusBar();

    const themeObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'class') updateStatusBar();
      }
    });
    themeObserver.observe(document.documentElement, { attributes: true });

    // 3. Hide splash screen once the app shell has rendered (not a 404).
    //    The (app) layout sets data-app-ready on the main container.
    //    Poll for it, with a 5-second hard ceiling to prevent the splash
    //    getting stuck if something truly fails.
    let splashHidden = false;
    const hideSplash = () => {
      if (splashHidden) return;
      splashHidden = true;
      SplashScreen.hide({ fadeOutDuration: 500 });
    };

    const pollInterval = setInterval(() => {
      if (document.querySelector('[data-app-ready]')) {
        clearInterval(pollInterval);
        hideSplash();
      }
    }, 200);

    // Hard ceiling: always hide after 5 seconds no matter what
    const timer = setTimeout(() => {
      clearInterval(pollInterval);
      hideSplash();
    }, 5000);

    // 4. Add native class to html and body for CSS targeting
    document.documentElement.classList.add('capacitor-native');
    document.body.classList.add('capacitor-native');

    // 4b. Add platform-specific class for platform-targeted CSS
    //     Android needs separate status bar inset handling (edge-to-edge enforced on Android 15+)
    //     iOS uses contentInset: 'never' + viewport-fit:cover for edge-to-edge
    const platform = cap?.getPlatform?.() || 'web';
    if (platform === 'android') {
      document.documentElement.classList.add('capacitor-android');
      document.body.classList.add('capacitor-android');
    } else if (platform === 'ios') {
      document.documentElement.classList.add('capacitor-ios');
      document.body.classList.add('capacitor-ios');
    }

    // 5. Wire up keyboard events to set a CSS variable for keyboard height.
    //    The Capacitor `resize: 'body'` mode only resizes document.body, but
    //    position:fixed elements (Sheets, Dialogs) reference the viewport.
    //    This variable lets fixed-position components offset above the keyboard.
    let keyboardCleanup: (() => void) | null = null;
    import('@capacitor/keyboard').then(({ Keyboard }) => {
      const showHandle = Keyboard.addListener('keyboardWillShow', (info) => {
        document.documentElement.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
      });
      const hideHandle = Keyboard.addListener('keyboardWillHide', () => {
        document.documentElement.style.setProperty('--keyboard-height', '0px');
      });
      // Initialize to 0
      document.documentElement.style.setProperty('--keyboard-height', '0px');
      keyboardCleanup = () => {
        showHandle.then(h => h.remove());
        hideHandle.then(h => h.remove());
      };
    }).catch(() => {
      // Keyboard plugin not available (web context)
    });

    // 6. Restore "tap status bar to scroll to top"
    //    Because we lock the body and scroll <main> instead, native iOS loses its
    //    automatic scroll-to-top feature. Capacitor fires a 'statusTap' event on window.
    const handleStatusTap = () => {
      const mainContent = document.querySelector('main[data-app-ready]');
      if (mainContent) {
        mainContent.scrollTo({
          top: 0,
          left: 0,
          behavior: 'smooth',
        });
      }
    };
    window.addEventListener('statusTap', handleStatusTap);

    return () => {
      clearTimeout(timer);
      clearInterval(pollInterval);
      keyboardCleanup?.();
      window.removeEventListener('statusTap', handleStatusTap);
      themeObserver.disconnect();
    };
  }, [router]);

  // Redirect unauthenticated native users to /login on startup
  useEffect(() => {
    if (!isNative || isLoading) return;

    if (!role) {
      const path = window.location.pathname;
      if (path === '/your-comms') {
        console.log('[native] Unauthenticated user on main view, redirecting to /login');
        router.replace('/login');
      }
    }
  }, [role, isLoading, router]);

  return null;
}
