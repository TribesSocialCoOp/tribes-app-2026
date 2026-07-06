import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

// When running `npx cap run android --live-reload`, Capacitor sets this env var.
// Fall back to production URL for release builds.
const isLiveReload = !!process.env.CAPACITOR_ANDROID_LIVERELOAD_URL || !!process.env.CAPACITOR_IOS_LIVERELOAD_URL;

// Staging native builds (set TRIBES_ENV=staging before `npx cap sync`) point the
// WebView and passkey origin at the staging host so they can coexist with prod on a
// device. The build scripts pair this with a distinct bundle/applicationId.
const isStaging = process.env.TRIBES_ENV === 'staging';
const APP_DOMAIN = isStaging ? 'staging.tribes.app' : 'tribes.app';
const APP_URL = `https://${APP_DOMAIN}`;
// Custom UA token lets Caddy.staging let the native WebView past the basic-auth gate
// (it sends this on every request, including the top-level document) while browsers
// still see the password prompt. Not a real secret — staging is noindex.
const stagingUserAgent = isStaging ? 'TribesStaging/1' : undefined;

const config: CapacitorConfig = {
  appId: 'app.tribes.android',
  appName: 'Tribes',
  webDir: 'out',
  server: {
    // Live-reload: let Capacitor CLI inject the URL automatically.
    // Production/staging: point the WebView at the live site.
    ...(isLiveReload ? {} : { url: APP_URL }),
    errorPath: 'error.html',
  },
  ios: {
    contentInset: 'never',
    allowsLinkPreview: false,
    ...(stagingUserAgent ? { appendUserAgent: stagingUserAgent } : {}),
  },
  android: {
    allowMixedContent: isLiveReload, // Allow http for local dev, block in production
    backgroundColor: '#0a0a0a',
    // Edge-to-edge inset handling for Android 15+ (runtime-supported, types lag behind)
    adjustMarginsForEdgeToEdge: 'force',
    ...(stagingUserAgent ? { appendUserAgent: stagingUserAgent } : {}),
  } as CapacitorConfig['android'] & { adjustMarginsForEdgeToEdge: string },
  plugins: {
    CapacitorPasskey: {
      origin: APP_URL,
      autoShim: true,
      domains: [APP_DOMAIN],
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 3000,
      launchFadeOutDuration: 500,
      backgroundColor: '#0a0a0a',
      showSpinner: false,
    },
    Keyboard: {
      resize: KeyboardResize.None,
      resizeOnFullScreen: true,
    },
  },
};

export default config;

