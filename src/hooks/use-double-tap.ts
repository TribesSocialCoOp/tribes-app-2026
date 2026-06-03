import { useRef, useCallback } from 'react';

/**
 * Hook that detects double-tap gestures for mobile.
 * 
 * On a single tap, it waits `delay` ms then fires `onSingleTap`.
 * If a second tap arrives within `delay` ms, it fires `onDoubleTap` instead
 * and cancels the single-tap action.
 * 
 * Usage:
 * ```tsx
 * const handleTap = useDoubleTap({
 *   onDoubleTap: () => setCollapsed(!collapsed),
 *   onSingleTap: () => router.push('/profile/123'),
 * });
 * <div onClick={handleTap}>...</div>
 * ```
 */
export function useDoubleTap({
  onDoubleTap,
  onSingleTap,
  delay = 300,
}: {
  onDoubleTap: () => void;
  onSingleTap?: () => void;
  delay?: number;
}) {
  const lastTapRef = useRef<number>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTap = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const now = Date.now();
      const elapsed = now - lastTapRef.current;

      if (elapsed < delay && elapsed > 0) {
        // Double-tap detected — cancel the pending single-tap
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        lastTapRef.current = 0;
        onDoubleTap();
      } else {
        // First tap — schedule single-tap fallback
        lastTapRef.current = now;
        timeoutRef.current = setTimeout(() => {
          lastTapRef.current = 0;
          timeoutRef.current = null;
          onSingleTap?.();
        }, delay);
      }
    },
    [onDoubleTap, onSingleTap, delay]
  );

  return handleTap;
}
