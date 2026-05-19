import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'app.tribes.android',
  appName: 'Tribes',
  webDir: 'out',
  server: {
    url: 'https://tribes.app',
    errorPath: 'error.html',
  },
  ios: {
    contentInset: 'always',
    allowsLinkPreview: false,
  },
  android: {
    allowMixedContent: false,
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
