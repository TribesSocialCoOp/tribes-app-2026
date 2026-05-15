import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'app.tribes.TribesApp',
  appName: 'Tribes',
  webDir: 'out',
  server: {
    url: 'https://tribes.app',
    cleartext: false,
    errorPath: 'error.html',
  },
  ios: {
    contentInset: 'always',
    allowsLinkPreview: false,
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#0a0a0a',
  },
  plugins: {
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
