"use client";

import { useEffect, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { isNative } from '@/lib/capacitor/platform';
import { initDeepLinks } from '@/lib/capacitor/deep-links';
import { syncStatusBarStyle } from '@/lib/capacitor/status-bar';
import { setSurfaceCookie } from '@/lib/capacitor/surface-cookie';
import { App } from '@capacitor/app';
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
  const pathname = usePathname();
  const { role, isLoading } = useUser();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // ── Android hardware back button (independent of isNative module const) ────
  // This must be OUTSIDE the isNative-gated effect below because the isNative
  // module constant can evaluate to false during SSR/hydration (the Capacitor
  // bridge isn't ready when the module is first imported). Instead, we detect
  // Capacitor at runtime inside useEffect when the DOM is guaranteed available.
  useEffect(() => {
    const cap = (window as any).Capacitor;
    if (!cap?.isNativePlatform?.() || cap?.getPlatform?.() !== 'android') return;

    // console.log('[native] Registering Android backButton listener');
    const handler = App.addListener('backButton', () => {
      // The layout.tsx sentinel injection guarantees a /your-comms entry
      // with { _tribesSentinel: true } state at the bottom of the history
      // stack. When we reach it, there's no more in-app history → exit.
      if (window.history.state?._tribesSentinel) {
        App.exitApp();
        return;
      }

      // Navigate back through actual browser history.
      // SPA navigations (router.push / link interceptor) add proper
      // pushState entries, so history.back() follows the real path
      // the user took — not a deterministic parent mapping.
      window.history.back();
    });

    return () => {
      handler.then(h => h.remove());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- router is not used; we use window.history.back()
  }, []);

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

      // Never intercept links that explicitly request a new tab/window.
      // e.g. target="_blank" links to /terms, /privacy — let the browser
      // handle those natively so the new tab actually opens.
      if (anchor.target === '_blank') return;

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

  // Mark native requests with a `tribes-surface` cookie so the server knows app-vs-web
  // (issue #32). Rides every same-origin request (fetch, navigations, documents).
  // No-op on web. Set once, early, before any server action.
  useEffect(() => { setSurfaceCookie(); }, []);

  // ── Native-only setup ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isNative) return;

    // 1. Initialize deep links
    initDeepLinks(router);

    // NOTE: Android back button handling has been moved to its own useEffect
    // above, independent of the isNative module constant, to avoid timing issues.

    // NOTE: WebAuthn passkey shim initialization has been moved to
    // PasskeyShimInitializer in the root layout so it's available on
    // the login page (auth layout) before the user authenticates.

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
    const platform = (window as any).Capacitor?.getPlatform?.() || 'web';
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

    // 7. Setup native push notification lifecycle listeners
    let pushCleanup: (() => void) | null = null;
    import('@capacitor/push-notifications').then(async ({ PushNotifications }) => {
      // Listen for foreground notifications
      const receivedHandle = await PushNotifications.addListener('pushNotificationReceived', async (notification) => {
        console.log('[push] Foreground notification received:', notification);
        
        // Haptic feedback
        try {
          const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
          await Haptics.impact({ style: ImpactStyle.Medium });
        } catch {
          // ignore
        }

        // Extract deep link URL from notification data
        const pushUrl = notification.data?.url;

        // Show in-app toast — navigate on click if we have a deep link
        const { toast: showToast } = await import('@/hooks/use-toast');

        const t = showToast({
          title: notification.title || 'New Notification',
          description: notification.body || '',
        });

        // Auto-navigate after a short delay if user doesn't dismiss
        if (pushUrl) {
          // Store for later navigation when the toast is tapped
          const handler = () => {
            window.location.assign(pushUrl);
          };
          // Listen for click on toast elements
          setTimeout(() => {
            const toastEl = document.querySelector('[data-state="open"][role="status"]');
            if (toastEl) {
              toastEl.addEventListener('click', handler, { once: true });
              (toastEl as HTMLElement).style.cursor = 'pointer';
            }
          }, 100);
        }
      });

      // Listen for background notification actions (tap)
      const actionHandle = await PushNotifications.addListener('pushNotificationActionPerformed', async (action) => {
        console.log('[push] Notification action performed:', JSON.stringify(action));
        
        // Extract redirect URL (e.g. data.url or action.notification.data.url)
        const data = action.notification?.data;
        const rawUrl = data?.url || data?.link || data?.redirect;
        
        // Validate the redirect is a known Tribes app path — prevents open
        // redirect if a crafted push payload contains an external URL.
        // Covers all route groups: (app), (auth), (legal), (onboarding)
        const SAFE_PATH_RE = /^\/(?:your-comms|activity|bonds?|tribes?|t\/|u\/|e\/|p\/|events?|settings|login|signup|forgot-password|recover|reset-password|account-recovery|admin|billing|creator-analytics|dashboard|discover|invite|moods?|my-wall|our-story|post|profile|search|vote|voting|family|event|terms|privacy|cookies|community-guidelines|report-ncii|ncii-status|create-tribe)/;
        const redirectUrl =
          typeof rawUrl === 'string' && rawUrl.startsWith('/') && SAFE_PATH_RE.test(rawUrl)
            ? rawUrl
            : '/activity';
        
        console.log('[push] Navigating to push action URL:', redirectUrl);
        // Use hard navigation — router.push() fails silently in Capacitor WebView
        window.location.assign(redirectUrl);
      });

      pushCleanup = () => {
        receivedHandle.remove();
        actionHandle.remove();
      };
    }).catch(err => {
      console.error('[push] Failed to load/init PushNotifications plugin:', err);
    });

    return () => {
      clearTimeout(timer);
      clearInterval(pollInterval);
      keyboardCleanup?.();
      pushCleanup?.();
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
