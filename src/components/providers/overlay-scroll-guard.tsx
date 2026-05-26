"use client";

import { useEffect, useRef } from "react";

/**
 * OverlayScrollGuard — prevents scroll-jump-to-top when Radix/Vaul
 * overlays open in Capacitor WebViews.
 *
 * How it works:
 *   1. Polls main.scrollTop every 50ms to reliably track position
 *      (scroll event listeners are unreliable in dev due to Strict Mode)
 *   2. Watches for data-scroll-locked (set by react-remove-scroll-bar)
 *   3. When an overlay opens and scroll shifted, restores via rAF loop
 *
 * Works in tandem with globals.css which neutralizes react-remove-scroll-bar's
 * body mutations (the main CSS fix), and drawer.tsx's noBodyStyles prop.
 * This guard catches the residual ~600px shift from Portal/FocusScope insertion.
 */
export function OverlayScrollGuard() {
  const stateRef = useRef({
    savedScrollTop: 0,
    isGuarding: false,
    guardTarget: 0,
  });

  useEffect(() => {
    // Only needed in Capacitor WebViews — desktop browsers don't exhibit
    // the scroll-jump because body isn't position:fixed in their layout.
    if (!document.documentElement.classList.contains('capacitor-native')) return;

    // Poll main.scrollTop to track position reliably
    const pollId = setInterval(() => {
      const main = document.querySelector("main[data-app-ready]") as HTMLElement | null;
      if (!main) return;

      const state = stateRef.current;
      const current = main.scrollTop;

      if (state.isGuarding) {
        if (current !== state.guardTarget) {
          main.scrollTop = state.guardTarget;
        }
        return;
      }

      if (current > 0) {
        state.savedScrollTop = current;
      }
    }, 50);

    // Detect overlay open/close via data-scroll-locked attribute
    const observer = new MutationObserver(() => {
      const main = document.querySelector("main[data-app-ready]") as HTMLElement | null;
      if (!main) return;

      const state = stateRef.current;

      if (document.body.hasAttribute("data-scroll-locked")) {
        // Overlay opened — wait one frame for reflow, then check for shift
        requestAnimationFrame(() => {
          const current = main.scrollTop;
          const delta = Math.abs(current - state.savedScrollTop);

          if (delta > 5 && state.savedScrollTop > 0) {
            state.isGuarding = true;
            state.guardTarget = state.savedScrollTop;
            main.scrollTop = state.savedScrollTop;

            // rAF restore loop to fight lingering resets
            let count = 0;
            const restore = () => {
              if (!state.isGuarding || count > 60) return;
              if (main.scrollTop !== state.guardTarget) {
                main.scrollTop = state.guardTarget;
              }
              count++;
              requestAnimationFrame(restore);
            };
            requestAnimationFrame(restore);

            setTimeout(() => {
              state.isGuarding = false;
              state.savedScrollTop = main.scrollTop;
            }, 1000);
          }
        });
      } else {
        // Overlay closed
        state.isGuarding = false;
        state.savedScrollTop = main.scrollTop;
      }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-scroll-locked"] });

    return () => {
      clearInterval(pollId);
      observer.disconnect();
    };
  }, []);

  return null;
}
