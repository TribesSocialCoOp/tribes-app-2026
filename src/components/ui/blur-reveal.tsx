"use client";

import * as React from "react";
import { EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface BlurRevealProps {
  /** Wrapper element — use 'span' when the overlay must live inside flowing text
   *  (e.g. markdown inline images). Defaults to 'div'. */
  as?: "div" | "span";
  /** Extra classes for the wrapper (margins, rounding). */
  className?: string;
  /** Classes for the blurred content layer (blur amount / scale). */
  blurClassName?: string;
  /** Overlay label text. */
  label?: string;
  /** Accessible label for the reveal button. */
  ariaLabel?: string;
  /** Overlay icon/text sizing. */
  size?: "sm" | "md";
  /** Called when the user taps to reveal — the caller decides what to render next. */
  onReveal: () => void;
  children: React.ReactNode;
}

const sizes = {
  sm: { gap: "gap-1", icon: "h-6 w-6", label: "text-xs" },
  md: { gap: "gap-1.5", icon: "h-7 w-7", label: "text-sm" },
};

/**
 * Adult-content blur with a tap-to-reveal overlay (issue #32). Renders the children
 * blurred (non-interactive) behind a full-cover reveal button; the caller owns the
 * revealed state and renders the unblurred content itself once `onReveal` fires.
 */
export function BlurReveal({
  as: Tag = "div",
  className,
  blurClassName = "blur-2xl scale-110",
  label = "Adult content — tap to reveal",
  ariaLabel = "Reveal adult content",
  size = "md",
  onReveal,
  children,
}: BlurRevealProps) {
  const s = sizes[size];
  return (
    <Tag className={cn("relative block overflow-hidden", className)}>
      <Tag className={cn("block pointer-events-none select-none", blurClassName)}>{children}</Tag>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onReveal(); }}
        className={cn(
          "absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/30 text-foreground",
          s.gap,
        )}
        aria-label={ariaLabel}
      >
        <EyeOff className={cn("opacity-80", s.icon)} />
        <span className={cn("font-medium", s.label)}>{label}</span>
      </button>
    </Tag>
  );
}

/**
 * Reveal state for adult media that AUTO-RE-BLURS (issue #32):
 *   - scrolls out of view  → IntersectionObserver flips it back to blurred
 *   - navigates away        → the component unmounts, which resets this local state
 * A reveal is therefore always transient; the user re-taps each time. Attach the
 * returned `ref` to the element wrapping the revealed media.
 */
export function useAutoReblur<T extends HTMLElement = HTMLDivElement>() {
  const [revealed, setRevealed] = React.useState(false);
  const ref = React.useRef<T>(null);

  React.useEffect(() => {
    if (!revealed) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (!entry.isIntersecting) setRevealed(false); },
      { threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [revealed]);

  const reveal = React.useCallback(() => setRevealed(true), []);
  return { revealed, reveal, ref };
}
