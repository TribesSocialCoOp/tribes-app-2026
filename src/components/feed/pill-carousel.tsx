"use client";

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PillCarouselProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Horizontally-scrollable pill container with:
 * - Snap-scroll on touch/swipe
 * - Fade-edge indicators when content overflows
 * - Left/right chevron arrows (hidden when at edge)
 */
export function PillCarousel({ children, className }: PillCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);

    return () => {
      el.removeEventListener('scroll', checkScroll);
      ro.disconnect();
    };
  }, [checkScroll]);

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.6;
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  return (
    <div className={cn("relative group", className)}>
      {/* Left fade + arrow */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-8 z-10 pointer-events-none transition-opacity duration-200",
          "bg-gradient-to-r from-background to-transparent",
          canScrollLeft ? "opacity-100" : "opacity-0"
        )}
      />
      {canScrollLeft && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 h-7 w-7 flex items-center justify-center rounded-full bg-background/90 border border-border shadow-sm text-muted-foreground hover:text-foreground transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}

      {/* Scrollable content */}
      <div
        ref={scrollRef}
        className="flex gap-1.5 overflow-x-auto scrollbar-none scroll-smooth snap-x snap-mandatory px-1 py-1"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {React.Children.map(children, (child) => (
          <div className="snap-start shrink-0">{child}</div>
        ))}
      </div>

      {/* Right fade + arrow */}
      <div
        className={cn(
          "absolute right-0 top-0 bottom-0 w-8 z-10 pointer-events-none transition-opacity duration-200",
          "bg-gradient-to-l from-background to-transparent",
          canScrollRight ? "opacity-100" : "opacity-0"
        )}
      />
      {canScrollRight && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 h-7 w-7 flex items-center justify-center rounded-full bg-background/90 border border-border shadow-sm text-muted-foreground hover:text-foreground transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
          aria-label="Scroll right"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
