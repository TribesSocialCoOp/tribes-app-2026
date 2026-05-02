import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { isNative } from './platform';

/**
 * Trigger a haptic feedback event.
 * No-ops if not running on a native device.
 */
export async function triggerHaptic(style: ImpactStyle = ImpactStyle.Medium) {
  if (!isNative) return;
  try {
    await Haptics.impact({ style });
  } catch (err) {
    console.warn('[haptics] Failed to trigger impact:', err);
  }
}

/**
 * Trigger a notification haptic (success, warning, error).
 */
export async function triggerNotificationHaptic(type: NotificationType = NotificationType.Success) {
  if (!isNative) return;
  try {
    await Haptics.notification({ type });
  } catch (err) {
    console.warn('[haptics] Failed to trigger notification:', err);
  }
}

/**
 * Trigger a selection haptic (light pulse).
 */
export async function triggerSelectionHaptic() {
  if (!isNative) return;
  try {
    await Haptics.selectionStart();
    await Haptics.selectionChanged();
    await Haptics.selectionEnd();
  } catch (err) {
    console.warn('[haptics] Failed to trigger selection:', err);
  }
}
