"use client";

/**
 * @fileoverview Push notification hook with dev simulator.
 *
 * DEV mode: Uses browser Notification API directly — no Service Worker needed.
 * PROD mode: Registers Service Worker + VAPID subscription.
 *
 * Pattern: Same as Garage S3 — simulate locally, swap transport for prod.
 */

import { useState, useEffect, useCallback } from 'react';

type PushPermission = 'default' | 'granted' | 'denied';

const IS_DEV = process.env.NODE_ENV === 'development';
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Check support and current permission on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const supported = 'Notification' in window;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission as PushPermission);
      setIsSubscribed(Notification.permission === 'granted');
    }
  }, []);

  /**
   * Request notification permission from the browser.
   */
  const requestPermission = useCallback(async (): Promise<PushPermission> => {
    if (!isSupported) return 'denied';

    const result = await Notification.requestPermission();
    const perm = result as PushPermission;
    setPermission(perm);
    return perm;
  }, [isSupported]);

  /**
   * Subscribe to push notifications.
   * DEV: Just requests permission and saves state.
   * PROD: Registers SW, creates VAPID subscription, sends to server.
   */
  const subscribe = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const perm = await requestPermission();
      if (perm !== 'granted') {
        setIsSubscribed(false);
        return false;
      }

      if (IS_DEV) {
        // Dev mode: just save permission state — no SW registration
        setIsSubscribed(true);

        // Show a test notification to confirm it works
        showLocalNotification(
          'Notifications Enabled! 🎉',
          'You will now receive local notifications from Tribes.app in dev mode.',
          '/'
        );

        // Save subscription to server (endpoint = 'local-dev')
        try {
          const { registerPushSubscriptionAction } = await import('@/lib/actions/content-actions');
          await registerPushSubscriptionAction({ endpoint: 'local-dev-simulator' });
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
  }, [requestPermission]);

  /**
   * Unsubscribe from push notifications.
   */
  const unsubscribe = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      setIsSubscribed(false);

      // Remove from server
      try {
        const { removePushSubscriptionAction } = await import('@/lib/actions/content-actions');
        await removePushSubscriptionAction();
      } catch {
        // Best effort
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
    showLocalNotification,
  };
}

// ─── Dev Simulator ───────────────────────────────────────────────────────────

/**
 * Show a local browser notification (dev simulator).
 * Uses the browser Notification API directly — no Service Worker needed.
 */
export function showLocalNotification(
  title: string,
  body: string,
  url?: string,
): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    const notification = new Notification(title, {
      body,
      icon: '/icon-192x192.png',
      tag: `tribes-${Date.now()}`,
    });

    if (url) {
      notification.onclick = () => {
        window.focus();
        window.location.href = url;
        notification.close();
      };
    }

    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000);
  } catch {
    // Fallback: some browsers don't support Notification constructor
    console.log(`[notification] ${title}: ${body}`);
  }
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
