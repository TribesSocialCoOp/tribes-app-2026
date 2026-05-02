"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isNative } from '@/lib/capacitor/platform';
import { initDeepLinks } from '@/lib/capacitor/deep-links';
import { syncStatusBarStyle } from '@/lib/capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

export function NativeInitializer() {
  const router = useRouter();

  useEffect(() => {
    if (!isNative) return;

    // 1. Initialize deep links
    initDeepLinks(router);

    // 2. Sync status bar (assuming dark theme by default, or could detect)
    syncStatusBarStyle(true);

    // 3. Hide splash screen after app has hydrated and connected
    const timer = setTimeout(() => {
      SplashScreen.hide({
        fadeOutDuration: 500
      });
    }, 1000);

    // 4. Add native class to body for CSS targeting
    document.body.classList.add('capacitor-native');

    return () => {
      clearTimeout(timer);
    };
  }, [router]);

  return null;
}
