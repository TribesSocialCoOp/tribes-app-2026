"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Tent } from "lucide-react";
import { cn } from "@/lib/utils";

interface PullToRefreshProps {
  children: React.ReactNode;
}

const MAX_PULL_HEIGHT = 120;
const REFRESH_THRESHOLD = 80;

export function PullToRefresh({ children }: PullToRefreshProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [startY, setStartY] = useState(0);
  const [pullHeight, setPullHeight] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // We must attach to the parent `<main>` scroll container
    // Because this component wraps the children, its parent element is `<main>`.
    const scrollContainer = container.parentElement;
    if (!scrollContainer) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Only allow pull-to-refresh if we are at the very top of the scroll container
      if (scrollContainer.scrollTop <= 0) {
        setStartY(e.touches[0].clientY);
      } else {
        setStartY(0);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (startY === 0 || isRefreshing) return;

      const currentY = e.touches[0].clientY;
      const pullDistance = currentY - startY;

      // If pulling down
      if (pullDistance > 0) {
        // Apply resistance
        const resistance = 0.5;
        const newHeight = Math.min(pullDistance * resistance, MAX_PULL_HEIGHT);
        setPullHeight(newHeight);
        
        // Prevent default browser behavior (like overscroll bounce) if we're capturing it
        if (newHeight > 10) {
          if (e.cancelable) e.preventDefault();
        }
      }
    };

    const handleTouchEnd = async () => {
      if (startY === 0 || isRefreshing) return;

      if (pullHeight > REFRESH_THRESHOLD) {
        setIsRefreshing(true);
        setPullHeight(50); // Snap to loading height

        // Trigger the Next.js router refresh
        router.refresh();

        // Wait a minimum time for visual feedback, then close
        setTimeout(() => {
          setIsRefreshing(false);
          setPullHeight(0);
          setStartY(0);
        }, 1000);
      } else {
        // Did not reach threshold, snap back
        setPullHeight(0);
        setStartY(0);
      }
    };

    scrollContainer.addEventListener("touchstart", handleTouchStart, { passive: true });
    scrollContainer.addEventListener("touchmove", handleTouchMove, { passive: false });
    scrollContainer.addEventListener("touchend", handleTouchEnd);

    return () => {
      scrollContainer.removeEventListener("touchstart", handleTouchStart);
      scrollContainer.removeEventListener("touchmove", handleTouchMove);
      scrollContainer.removeEventListener("touchend", handleTouchEnd);
    };
  }, [startY, pullHeight, isRefreshing, router]);

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col">
      {/* Pull Indicator */}
      <div 
        className={cn(
          "w-full flex items-center justify-center overflow-hidden transition-[height] duration-200 ease-out shrink-0 bg-background",
          isRefreshing && "transition-[height] duration-300"
        )}
        style={{ 
          height: `${pullHeight}px`,
        }}
      >
        <Tent 
          className={cn(
            "h-6 w-6 transition-all duration-200",
            isRefreshing ? "text-primary animate-pulse" : "text-muted-foreground",
            pullHeight < REFRESH_THRESHOLD && !isRefreshing ? "opacity-50 scale-90" : "opacity-100 scale-100"
          )} 
        />
      </div>
      
      {/* Main Content */}
      <div className="w-full flex-1 flex flex-col">
        {children}
      </div>
    </div>
  );
}
