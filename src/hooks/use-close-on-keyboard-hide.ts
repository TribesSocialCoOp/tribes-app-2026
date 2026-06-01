import { useEffect } from 'react';
import { isAndroid, isNative } from '@/lib/capacitor/platform';

/**
 * On Android native, the hardware back button hides the keyboard first
 * (consuming the event), then requires a SECOND press to close the dialog.
 * This hook closes the dialog automatically when the keyboard hides,
 * giving users the expected "one press to cancel" behavior.
 *
 * Only active on Android native — no-op on iOS and web.
 */
export function useCloseOnKeyboardHide(
  isOpen: boolean,
  onClose: () => void,
  suppressRef?: React.RefObject<boolean | null>,
) {
  useEffect(() => {
    if (!isOpen || !isNative || !isAndroid) return;

    let cleanup: (() => void) | null = null;

    import('@capacitor/keyboard').then(({ Keyboard }) => {
      const handle = Keyboard.addListener('keyboardDidHide', () => {
        if (suppressRef?.current) {
          // Skip closing because we're interacting with elements that blur input
          return;
        }
        onClose();
      });
      cleanup = () => {
        handle.then(h => h.remove());
      };
    }).catch(() => {
      // Keyboard plugin not available
    });

    return () => {
      cleanup?.();
    };
  }, [isOpen, onClose, suppressRef]);
}
