import { App } from '@capacitor/app';
import { isNative } from './platform';

/**
 * Initialize deep link listener for the native app.
 */
export function initDeepLinks(router: any) {
  if (!isNative) return;

  App.addListener('appUrlOpen', (data) => {
    try {
      // data.url will be something like: tribes.app/bond/tap/xxx
      const url = new URL(data.url);
      const path = url.pathname + url.search;
      
      console.log('[deep-link] Opening path:', path);
      router.push(path);
    } catch (err) {
      console.error('[deep-link] Failed to parse URL:', data.url, err);
    }
  });
}
