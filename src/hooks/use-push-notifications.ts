"use client";

/**
 * @fileoverview Push notification hook with dev simulator and native Capacitor support.
 *
 * Web DEV mode: Uses toast alerts.
 * Web PROD mode: Registers Service Worker + VAPID subscription.
 * Native (iOS/Android) mode: Registers via native APNs/FCM and sends token to server.
 *
 * IMPORTANT: On Android, we must NOT call PushNotifications.checkPermissions()
 * eagerly on mount. Capacitor core's getPermissionStates() has a known NPE bug
 * on certain Android devices/versions that kills the entire native process.
 * Instead we persist subscription state to localStorage and only touch native
 * APIs when the user explicitly interacts with the push notification toggle.
 */

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { isNative, platform } from '@/lib/capacitor/platform';

type PushPermission = 'default' | 'granted' | 'denied';

const IS_DEV = process.env.NODE_ENV === 'development';
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PUSH_STATE_KEY = 'tribes:push-subscribed';

export function usePushNotifications() {
  const { toast } = useToast();
  const [permission, setPermission] = useState<PushPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Check support and current permission on mount.
  // For NATIVE: we restore the last-known subscription state from localStorage
  // instead of calling the native checkPermissions() API, which can cause a
  // fatal NullPointerException crash on certain Android devices (Capacitor bug).
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (isNative) {
      setIsSupported(true);
      // Restore persisted state — avoids touching the native plugin on mount
      const saved = localStorage.getItem(PUSH_STATE_KEY);
      if (saved === 'granted') {
        setPermission('granted');
        setIsSubscribed(true);
      }
      return;
    }

    const supported = 'Notification' in window;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission as PushPermission);
      setIsSubscribed(Notification.permission === 'granted');
    }
  }, []);

  /**
   * Request notification permission from the browser or OS.
   */
  const requestPermission = useCallback(async (): Promise<PushPermission> => {
    if (isNative) {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const permStatus = await PushNotifications.requestPermissions();
        const perm = permStatus.receive === 'granted' ? 'granted' : (permStatus.receive === 'denied' ? 'denied' : 'default');
        setPermission(perm);
        return perm;
      } catch (err) {
        console.error('[push] Request permission native error:', err);
        return 'denied';
      }
    }

    if (!isSupported) return 'denied';

    const result = await Notification.requestPermission();
    const perm = result as PushPermission;
    setPermission(perm);
    return perm;
  }, [isSupported]);

  /**
   * Subscribe to push notifications.
   * Native: Requests native OS permissions, registers with APNs/FCM, sends token.
   * Web DEV: Simulates subscription, sends placeholder to server.
   * Web PROD: Registers SW, creates VAPID subscription, sends to server.
   */
  const subscribe = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      if (isNative) {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const perm = await requestPermission();
        if (perm !== 'granted') {
          setIsSubscribed(false);
          return false;
        }

        // ⚠️ AWAIT the registration promise here — do NOT `return` it directly.
        // This function's outer `finally { setIsLoading(false) }` runs the moment a value
        // is returned; returning the pending promise reset the loading state (and the UI
        // toggle) *before* the native `registration` event fired — the "flash then nothing"
        // symptom — and left the toggle stuck if the token never arrived. Awaiting keeps
        // isLoading true until registration truly settles.
        const registered = await new Promise<boolean>(async (resolve) => {
          let tokenListener: any;
          let errorListener: any;
          let settled = false;

          const cleanup = () => {
            if (tokenListener) tokenListener.remove();
            if (errorListener) errorListener.remove();
          };
          const finish = (value: boolean) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            cleanup();
            resolve(value);
          };

          // Safety net: if APNs/FCM never fires `registration` OR `registrationError`
          // (e.g. missing Push capability, no network, provisioning mismatch), don't hang
          // the toggle forever — surface an actionable failure after 30s.
          const timeout = setTimeout(() => {
            console.error('[push] Native registration timed out after 30s — no token or error event fired');
            toast({
              title: 'Registration Timed Out',
              description: 'The device never returned a push token. Check notification permissions and try again.',
              variant: 'destructive',
            });
            finish(false);
          }, 30_000);

          try {
            tokenListener = await PushNotifications.addListener('registration', async (token) => {
              const truncated = token.value.length > 12 ? token.value.slice(0, 8) + '…' + token.value.slice(-4) : token.value;
              console.log('[push] Native registration successful, token:', truncated);
              try {
                const { registerPushSubscriptionAction } = await import('@/lib/actions/content-actions');
                await registerPushSubscriptionAction({
                  endpoint: token.value,
                  platform: platform,
                  // APNs gateway hint only — the server self-corrects on BadDeviceToken and
                  // persists the right value, so a wrong first guess no longer loses the token.
                  apnsSandbox: platform === 'ios' ? IS_DEV : undefined,
                });
                setIsSubscribed(true);
                setPermission('granted');
                localStorage.setItem(PUSH_STATE_KEY, 'granted');
                toast({
                  title: 'Notifications Enabled! 🎉',
                  description: 'You will now receive native push notifications on this device.',
                });
                finish(true);
              } catch (err) {
                console.error('[push] Failed to save native token to server:', err);
                toast({
                  title: 'Could Not Save Token',
                  description: 'Push registered on-device but the server did not accept it. Please try again.',
                  variant: 'destructive',
                });
                finish(false);
              }
            });

            errorListener = await PushNotifications.addListener('registrationError', (err) => {
              console.error('[push] Native registration error event:', err);
              toast({
                title: 'Registration Failed',
                description: 'Could not register for push notifications.',
                variant: 'destructive',
              });
              finish(false);
            });

            console.log('[push] Calling PushNotifications.register()…');
            await PushNotifications.register();
          } catch (err) {
            console.error('[push] Native register exception:', err);
            finish(false);
          }
        });
        return registered;
      }

      const perm = await requestPermission();
      if (perm !== 'granted') {
        setIsSubscribed(false);
        return false;
      }

      if (IS_DEV) {
        // Dev mode: just save permission state
        setIsSubscribed(true);

        toast({
          title: 'Notifications Enabled! 🎉',
          description: 'You will now receive local notifications in dev mode.',
        });

        try {
          const { registerPushSubscriptionAction } = await import('@/lib/actions/content-actions');
          await registerPushSubscriptionAction({ endpoint: 'local-dev-simulator', platform: 'web' });
        } catch {
          // Best effort
        }

        return true;
      }

      // Prod mode: Register Service Worker + VAPID
      if ('serviceWorker' in navigator && VAPID_PUBLIC_KEY) {
        const registration = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
        });

        // Send subscription to server
        const { registerPushSubscriptionAction } = await import('@/lib/actions/content-actions');
        await registerPushSubscriptionAction({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: arrayBufferToBase64(subscription.getKey('p256dh')),
            auth: arrayBufferToBase64(subscription.getKey('auth')),
          },
          platform: 'web'
        });

        setIsSubscribed(true);
        return true;
      }

      return false;
    } catch (err) {
      console.error('[push] Subscribe error:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [requestPermission, toast]);

  /**
   * Unsubscribe from push notifications.
   */
  const unsubscribe = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      setIsSubscribed(false);
      setPermission('default');
      localStorage.removeItem(PUSH_STATE_KEY);

      // Remove from server
      try {
        const { removePushSubscriptionAction } = await import('@/lib/actions/content-actions');
        await removePushSubscriptionAction(platform);
      } catch {
        // Best effort
      }

      if (isNative) {
        try {
          const { PushNotifications } = await import('@capacitor/push-notifications');
          await PushNotifications.removeAllListeners();
        } catch (err) {
          console.error('[push] Unsubscribe native error:', err);
        }
        return;
      }

      // Prod: Unregister SW subscription
      if (!IS_DEV && 'serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isSupported,
    isSubscribed,
    permission,
    isLoading,
    subscribe,
    unsubscribe,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}
