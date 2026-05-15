"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EncryptedImage } from './encrypted-image';
import type { Ring } from '@/lib/types';

interface ImageLightboxProps {
  images: string[];
  initialIndex?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isEncrypted?: boolean;
  postId?: string;
  ring?: Ring;
  tribeId?: string;
}

export function ImageLightbox({ images, initialIndex = 0, open, onOpenChange, isEncrypted, postId, ring, tribeId }: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // ── Swipe gesture state ──────────────────────────────────────
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState({ x: 0, y: 0 });
  const [isDismissing, setIsDismissing] = useState(false);

  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
      setSwipeOffset({ x: 0, y: 0 });
      setIsDismissing(false);
    }
  }, [open, initialIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'ArrowLeft') {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
      } else if (e.key === 'ArrowRight') {
        setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, images.length]);

  // Browser back button / swipe-back closes lightbox
  useEffect(() => {
    if (!open) return;

    // Push a dummy history entry so back-gesture closes lightbox instead of navigating
    window.history.pushState({ lightbox: true }, '');

    const handlePopState = () => {
      onOpenChange(false);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Clean up dummy history entry if lightbox closes by other means (X button, backdrop tap)
      if (window.history.state?.lightbox) {
        window.history.back();
      }
    };
  }, [open, onOpenChange]);

  // ── Touch handlers ──────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    setSwipeOffset({ x: 0, y: 0 });
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    setSwipeOffset({ x: dx, y: dy });
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!touchStartRef.current) return;

    const { x: dx, y: dy } = swipeOffset;
    const elapsed = Date.now() - touchStartRef.current.time;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Swipe down → dismiss (threshold: 80px or fast flick)
    if (dy > 80 || (dy > 40 && elapsed < 300)) {
      setIsDismissing(true);
      setTimeout(() => onOpenChange(false), 200);
      touchStartRef.current = null;
      return;
    }

    // Horizontal swipe → navigate (threshold: 60px, must be more horizontal than vertical)
    if (absDx > 60 && absDx > absDy * 1.5 && images.length > 1) {
      if (dx < 0) {
        // Swipe left → next
        setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
      } else {
        // Swipe right → prev
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
      }
    }

    setSwipeOffset({ x: 0, y: 0 });
    touchStartRef.current = null;
  }, [swipeOffset, images.length, onOpenChange]);

  if (!images || images.length === 0) return null;

  // Calculate visual feedback for swipe-to-dismiss
  const dismissProgress = Math.min(Math.max(swipeOffset.y / 200, 0), 1);
  const imageTransform = swipeOffset.y > 0
    ? `translateY(${swipeOffset.y}px) scale(${1 - dismissProgress * 0.15})`
    : '';
  const backdropOpacity = isDismissing ? 0 : 1 - dismissProgress * 0.6;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[100vw] max-h-[100vh] w-screen h-screen p-0 m-0 bg-black/95 border-none shadow-none rounded-none flex flex-col justify-center items-center gap-0 overflow-hidden [&>button:last-child]:hidden">
        <div className="sr-only">
            <DialogTitle>Image Viewer</DialogTitle>
            <DialogDescription>View post images in full screen</DialogDescription>
        </div>

        {/* Close button — safe zone on mobile (below notch/dynamic island) */}
        <button 
            onClick={() => onOpenChange(false)}
            className="absolute top-[max(1rem,env(safe-area-inset-top,16px))] right-4 sm:top-6 sm:right-6 z-50 p-3 bg-black/50 hover:bg-black/70 active:bg-black/80 rounded-full text-white/90 hover:text-white transition-colors"
            aria-label="Close image viewer"
        >
          <X className="h-7 w-7 sm:h-6 sm:w-6" />
        </button>

        {/* Navigation arrows (multi-image) */}
        {images.length > 1 && (
          <>
            <button 
              onClick={(e) => { e.stopPropagation(); setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1)); }}
              className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 z-50 p-2 sm:p-3 bg-black/40 hover:bg-black/60 rounded-full text-white/80 hover:text-white transition-colors"
            >
              <ChevronLeft className="h-6 w-6 sm:h-8 sm:w-8" />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0)); }}
              className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 z-50 p-2 sm:p-3 bg-black/40 hover:bg-black/60 rounded-full text-white/80 hover:text-white transition-colors"
            >
              <ChevronRight className="h-6 w-6 sm:h-8 sm:w-8" />
            </button>
          </>
        )}

        {/* Image container with swipe gesture support */}
        <div 
          className={cn(
            "relative w-full h-full flex items-center justify-center p-2 sm:p-8 outline-none select-none",
            isDismissing && "transition-all duration-200 ease-out"
          )}
          style={{ 
            opacity: backdropOpacity,
          }}
          onClick={() => onOpenChange(false)}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div 
            className={cn(
              isDismissing && "transition-transform duration-200 ease-out"
            )}
            style={{ 
              transform: isDismissing ? 'translateY(100vh)' : imageTransform,
            }}
          >
            {isEncrypted && postId ? (
              <EncryptedImage 
                fileId={images[currentIndex]} 
                postId={postId}
                ring={ring}
                tribeId={tribeId}
                className="max-w-full max-h-[90vh] object-contain pointer-events-auto shadow-2xl"
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img 
                src={images[currentIndex]} 
                alt={`Image ${currentIndex + 1} of ${images.length}`} 
                className="max-w-full max-h-[90vh] object-contain pointer-events-auto shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>
        </div>

        {/* Swipe hint — shown briefly on mobile */}
        {images.length <= 1 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 text-white/30 text-xs sm:hidden pointer-events-none">
            Swipe down to close
          </div>
        )}

        {/* Dot indicators (multi-image) */}
        {images.length > 1 && (
            <div className="absolute bottom-4 sm:bottom-8 left-1/2 -translate-x-1/2 z-50 flex gap-2">
                {images.map((_, idx) => (
                    <button 
                        key={idx}
                        onClick={(e) => { e.stopPropagation(); setCurrentIndex(idx); }}
                        className={cn(
                            "w-2.5 h-2.5 sm:w-2 sm:h-2 rounded-full transition-all",
                            currentIndex === idx ? "bg-white scale-125" : "bg-white/40 hover:bg-white/60"
                        )}
                        aria-label={`Go to image ${idx + 1}`}
                    />
                ))}
            </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
