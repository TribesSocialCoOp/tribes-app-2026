import { App } from '@capacitor/app';
import { isNative } from './platform';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';

/**
 * Initialize deep link listener for the native app.
 *
 * When the OS opens the app via a Universal Link (iOS) or App Link (Android),
 * Capacitor fires `appUrlOpen`. We extract the path and push it to the Next.js
 * router so the user lands on the correct page.
 */
export function initDeepLinks(router: AppRouterInstance) {
  if (!isNative) return;

  App.addListener('appUrlOpen', (data) => {
    try {
      const url = new URL(data.url);
      const path = url.pathname + url.search;

      console.log('[deep-link] Opening path:', path);
      router.push(path);
    } catch (err) {
      console.error('[deep-link] Failed to parse URL:', data.url, err);
    }
  });
}
