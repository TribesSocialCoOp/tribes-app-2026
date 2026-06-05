"use client";

import React, { useState, useEffect, useRef } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function JumpToTop() {
  const [isVisible, setIsVisible] = useState(false);
  const scrollContainerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Find the main scroll container
    const main = document.querySelector("main[data-app-ready]");
    scrollContainerRef.current = main as HTMLElement | null;

    const handleScroll = () => {
      const container = scrollContainerRef.current;
      const scrollTop = container ? container.scrollTop : window.scrollY;
      
      // Show when scrolled past 300px
      if (scrollTop > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    // Attach to main container if it exists, otherwise fallback to window
    const target = scrollContainerRef.current || window;
    target.addEventListener("scroll", handleScroll, { passive: true });

    // Initial check in case it's already scrolled
    handleScroll();

    // Since main container might mount after this hook runs on fast renders,
    // let's do a fallback check after a short delay to re-bind if main wasn't found initially.
    let timeoutId: NodeJS.Timeout;
    if (!main) {
      timeoutId = setTimeout(() => {
        const fallbackMain = document.querySelector("main[data-app-ready]");
        if (fallbackMain) {
          scrollContainerRef.current = fallbackMain as HTMLElement;
          target.removeEventListener("scroll", handleScroll);
          fallbackMain.addEventListener("scroll", handleScroll, { passive: true });
          handleScroll();
        }
      }, 500);
    }

    return () => {
      target.removeEventListener("scroll", handleScroll);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.removeEventListener("scroll", handleScroll);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  const handleClick = () => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } else {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  };

  return (
    <button
      onClick={handleClick}
      aria-label="Scroll to top"
      className={cn(
        "fixed z-40 right-[calc(1rem+env(safe-area-inset-right,0px))] md:right-8 flex items-center justify-center w-10 h-10 rounded-full",
        "bg-primary text-primary-foreground shadow-lg backdrop-blur-sm bg-primary/95",
        "border border-primary-foreground/10 hover:bg-primary/90 hover:scale-105 active:scale-95",
        "transition-all duration-300 ease-out will-change-all",
        "bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-8",
        isVisible 
          ? "opacity-100 translate-y-0 pointer-events-auto" 
          : "opacity-0 translate-y-4 pointer-events-none"
      )}
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
