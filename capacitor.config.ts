import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

// When running `npx cap run android --live-reload`, Capacitor sets this env var.
// Fall back to production URL for release builds.
const isLiveReload = !!process.env.CAPACITOR_ANDROID_LIVERELOAD_URL || !!process.env.CAPACITOR_IOS_LIVERELOAD_URL;

const config: CapacitorConfig = {
  appId: 'app.tribes.android',
  appName: 'Tribes',
  webDir: 'out',
  server: {
    // Live-reload: let Capacitor CLI inject the URL automatically.
    // Production: point the WebView at the live site.
    ...(isLiveReload ? {} : { url: 'https://tribes.app' }),
    errorPath: 'error.html',
  },
  ios: {
    contentInset: 'never',
    allowsLinkPreview: false,
  },
  android: {
    allowMixedContent: isLiveReload, // Allow http for local dev, block in production
    backgroundColor: '#0a0a0a',
    // Edge-to-edge inset handling for Android 15+ (runtime-supported, types lag behind)
    adjustMarginsForEdgeToEdge: 'force',
  } as CapacitorConfig['android'] & { adjustMarginsForEdgeToEdge: string },
  plugins: {
    CapacitorPasskey: {
      origin: 'https://tribes.app',
      autoShim: true,
      domains: ['tribes.app'],
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

