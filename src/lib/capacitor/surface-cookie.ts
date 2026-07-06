/**
 * Surface marker (issue #32). Tells the SERVER whether a request came from the native
 * app (iOS/Android) vs the web browser, by setting a first-party `tribes-surface` cookie
 * when running inside the Capacitor shell.
 *
 * Why a cookie (vs the old fetch wrapper): a cookie rides EVERY same-origin request the
 * WebView makes — `fetch`, Next.js server actions, RSC navigations, AND full document
 * loads — so the server sees the surface consistently. The previous approach monkey-
 * patched `window.fetch`, which only tagged fetch() calls and left navigations blind.
 *
 * Server side: getSurface() (src/lib/geo/resolve-region.ts) reads this cookie to
 *   (a) enforce that the 18+ "show adult content" opt-in is set on the WEB only
 *       (Apple Reddit-pattern — no in-app toggle), and
 *   (b) tailor gate messaging (native → "enable on web").
 * Web requests carry no cookie and default to 'web' server-side.
 *
 * Best-effort only: a modified native client can omit the cookie, so this is App-Store
 * compliance, not a security boundary — real age verification stays server-enforced.
 */
const COOKIE_NAME = 'tribes-surface';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function setSurfaceCookie(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // Runtime detection (the isNative module const can be false during hydration).
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
  const platform = cap?.isNativePlatform?.() ? cap.getPlatform?.() : undefined;
  if (platform !== 'ios' && platform !== 'android') return; // web → no marker needed

  // Set it so the server sees it on EVERY view:
  //   Path=/         → applies to every route, not just the one that set it.
  //   Max-Age=1y     → persists across app launches, so even the cold-start document
  //                    request carries it (WKWebView/Android WebView keep the cookie jar).
  //   SameSite=Lax   → sent on same-site subresources AND top-level navigations (the
  //                    WebView origin IS tribes.app, so everything is first-party).
  //   Secure         → https only; native always loads https (staging/prod). Omitted on
  //                    http so a local dev WebView could still set it.
  //   (no Domain)    → host-only; stays bound to this exact origin (tribes.app vs
  //                    staging.tribes.app), never leaks across environments.
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE_NAME}=${platform}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure}`;
}
