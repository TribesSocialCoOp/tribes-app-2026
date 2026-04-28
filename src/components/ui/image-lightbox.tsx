"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageLightboxProps {
  images: string[];
  initialIndex?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImageLightbox({ images, initialIndex = 0, open, onOpenChange }: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  
  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
    }
  }, [open, initialIndex]);

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

  if (!images || images.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[100vw] max-h-[100vh] w-screen h-screen p-0 m-0 bg-black/95 border-none shadow-none rounded-none flex flex-col justify-center items-center gap-0 overflow-hidden [&>button:last-child]:hidden">
        <div className="sr-only">
            <DialogTitle>Image Viewer</DialogTitle>
            <DialogDescription>View post images in full screen</DialogDescription>
        </div>

        <button 
            onClick={() => onOpenChange(false)}
            className="absolute top-4 right-4 sm:top-6 sm:right-6 z-50 p-2 bg-black/40 hover:bg-black/60 rounded-full text-white/80 hover:text-white transition-colors"
        >
          <X className="h-6 w-6" />
        </button>

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

        <div className="relative w-full h-full flex items-center justify-center p-2 sm:p-8 outline-none" onClick={() => onOpenChange(false)}>
           {/* eslint-disable-next-line @next/next/no-img-element */}
           <img 
             src={images[currentIndex]} 
             alt={`Image ${currentIndex + 1} of ${images.length}`} 
             className="max-w-full max-h-[90vh] object-contain pointer-events-auto shadow-2xl"
             onClick={(e) => e.stopPropagation()}
           />
        </div>

        {images.length > 1 && (
            <div className="absolute bottom-4 sm:bottom-8 left-1/2 -translate-x-1/2 z-50 flex gap-2">
                {images.map((_, idx) => (
                    <button 
                        key={idx}
                        onClick={(e) => { e.stopPropagation(); setCurrentIndex(idx); }}
                        className={cn(
                            "w-2 h-2 rounded-full transition-all",
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
