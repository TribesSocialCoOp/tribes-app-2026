"use client";

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Hook to automatically scroll to and highlight a post or comment
 * when search params are present.
 * 
 * Supports:
 * - ?post= or ?postId= → scroll to post + glow
 * - ?commentId= → scroll to the specific comment within a post + glow
 * 
 * Uses a polling approach to wait for the target element to appear in the DOM,
 * since feed data loads asynchronously and comments render after posts.
 * 
 * @param deps - Additional values that trigger a re-check (e.g. feed items count).
 */
export function useScrollToPost(deps: unknown[] = []) {
  const searchParams = useSearchParams();
  const targetPostId = searchParams.get('postId') || searchParams.get('post');
  const targetCommentId = searchParams.get('commentId');
  const depsKey = JSON.stringify(deps);
  const scrolledRef = useRef<string | null>(null);

  useEffect(() => {
    const scrollTarget = targetCommentId || targetPostId;
    if (!scrollTarget) return;

    const scrollKey = `${scrollTarget}:${depsKey}`;
    // If the target ID changed, reset the scrolledRef so we can scroll again
    if (scrolledRef.current && !scrolledRef.current.startsWith(scrollTarget)) {
      scrolledRef.current = null;
    }
    if (scrolledRef.current === scrollKey) return;

    // Glow highlight effect
    const glowElement = (el: HTMLElement) => {
      el.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'ring-offset-background', 'rounded-lg', 'transition-all', 'duration-500');
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'ring-offset-background', 'rounded-lg');
      }, 3000);
    };

    // Poll for the element to appear in the DOM (feed loads async)
    const elementId = targetCommentId
      ? `comment-${targetCommentId}`
      : `post-${targetPostId}`;

    let attempts = 0;
    const maxAttempts = 40; // 40 × 250ms = 10 seconds max wait
    
    const poll = setInterval(() => {
      attempts++;
      const el = document.getElementById(elementId);

      if (el) {
        clearInterval(poll);
        scrolledRef.current = scrollKey;

        // Account for fixed header (~64px)
        const headerOffset = 72;
        const elementPosition = el.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: elementPosition - headerOffset, behavior: 'smooth' });

        // Apply glow after scroll completes
        setTimeout(() => {
          const glowTarget = targetCommentId ? document.getElementById(`comment-bubble-${targetCommentId}`) || el : el;
          glowElement(glowTarget);
        }, 400);
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(poll);
        // Fallback: if we have a postId but couldn't find the comment,
        // at least scroll to the post
        if (targetCommentId && targetPostId) {
          const postEl = document.getElementById(`post-${targetPostId}`);
          if (postEl) {
            scrolledRef.current = scrollKey;
            const headerOffset = 72;
            const elementPosition = postEl.getBoundingClientRect().top + window.scrollY;
            window.scrollTo({ top: elementPosition - headerOffset, behavior: 'smooth' });
            setTimeout(() => glowElement(postEl), 400);
          }
        }
      }
    }, 250);

    return () => clearInterval(poll);
  }, [targetPostId, targetCommentId, depsKey]);
}
