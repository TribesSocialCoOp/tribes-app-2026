import { StatusBar, Style } from '@capacitor/status-bar';
import { isNative, platform } from './platform';

/**
 * Sync status bar style with the app's theme.
 */
export async function syncStatusBarStyle(isDark: boolean) {
  if (!isNative) return;

  try {
    // On iOS, we usually want to set the style (dark/light icons)
    // On Android, we also set the background color
    await StatusBar.setStyle({
      style: isDark ? Style.Dark : Style.Light
    });

    if (platform === 'android') {
      await StatusBar.setBackgroundColor({
        color: isDark ? '#0a0a0a' : '#ffffff'
      });
    }
  } catch (err) {
    console.warn('[status-bar] Sync failed:', err);
  }
}

/**
 * Hide the status bar (e.g. for splash screen or full-screen video).
 */
export async function hideStatusBar() {
  if (!isNative) return;
  try {
    await StatusBar.hide();
  } catch {}
}

/**
 * Show the status bar.
 */
export async function showStatusBar() {
  if (!isNative) return;
  try {
    await StatusBar.show();
  } catch {}
}
