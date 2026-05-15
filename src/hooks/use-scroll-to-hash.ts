"use client";

import { useEffect, useRef } from 'react';

/**
 * Hook to scroll-to and highlight an element targeted by a URL hash fragment.
 *
 * Works with any `id` on the page (e.g. `/settings#vault` scrolls to `<div id="vault">`).
 * Uses a polling approach identical to `useScrollToPost` so the target element can
 * render asynchronously (e.g. behind auth guards or lazy-loaded sections).
 *
 * @param deps - Additional values that trigger a re-check (e.g. loading state).
 */
export function useScrollToHash(deps: unknown[] = []) {
  const depsKey = JSON.stringify(deps);
  const scrolledRef = useRef<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash?.replace('#', '');
    if (!hash) return;

    const scrollKey = `${hash}:${depsKey}`;
    if (scrolledRef.current === scrollKey) return;

    // Glow highlight effect (shared pattern with useScrollToPost)
    const glowElement = (el: HTMLElement) => {
      el.classList.add('ring-2', 'ring-primary/50', 'ring-offset-2', 'ring-offset-background', 'rounded-lg', 'transition-all', 'duration-500');
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-primary/50', 'ring-offset-2', 'ring-offset-background', 'rounded-lg');
      }, 2500);
    };

    // Poll for the element to appear in the DOM (sections may load async)
    let attempts = 0;
    const maxAttempts = 20; // 20 × 250ms = 5 seconds max wait

    const poll = setInterval(() => {
      attempts++;
      const el = document.getElementById(hash);

      if (el) {
        clearInterval(poll);
        scrolledRef.current = scrollKey;

        // scroll-mt-* CSS handles header offset; use scrollIntoView for simplicity
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Apply glow after scroll completes
        setTimeout(() => glowElement(el), 400);
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(poll);
      }
    }, 250);

    return () => clearInterval(poll);
  }, [depsKey]);
}
