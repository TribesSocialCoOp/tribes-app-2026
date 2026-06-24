/**
 * Surface header (issue #32). Tells the SERVER whether a request came from the
 * native app (iOS/Android) vs the web browser, by adding `X-Tribes-Surface` to
 * same-origin requests when running inside the Capacitor shell.
 *
 * Why: the server's getSurface() (src/lib/geo/resolve-region.ts) reads this header
 * to (a) enforce that the 18+ "show adult content" opt-in is set on the WEB only
 * (Apple Reddit-pattern) and (b) tailor gate messaging (native → "enable on web").
 * Web requests send no header and default to 'web' server-side.
 *
 * Implementation: a one-time fetch wrapper. Next.js server actions POST via the
 * browser's fetch, so the header rides along and shows up in headers() server-side.
 */
let installed = false;

export function installSurfaceHeader(): void {
  if (installed || typeof window === 'undefined') return;

  // Runtime detection (the isNative module const can be false during hydration).
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
  const platform = cap?.isNativePlatform?.() ? cap.getPlatform?.() : undefined;
  if (platform !== 'ios' && platform !== 'android') return; // web → no header needed

  installed = true;
  const origFetch = window.fetch.bind(window);
  const origin = window.location.origin;

  const isSameOrigin = (url: string) => url.startsWith('/') || url.startsWith(origin);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      if (input instanceof Request) {
        if (isSameOrigin(input.url)) {
          const headers = new Headers(input.headers);
          headers.set('X-Tribes-Surface', platform);
          input = new Request(input, { headers });
        }
      } else {
        const url = typeof input === 'string' ? input : input.href;
        if (isSameOrigin(url)) {
          const headers = new Headers(init?.headers);
          headers.set('X-Tribes-Surface', platform);
          init = { ...init, headers };
        }
      }
    } catch {
      // On any failure, fall through with the original args — never break fetch.
    }
    return origFetch(input as RequestInfo | URL, init);
  };
}
