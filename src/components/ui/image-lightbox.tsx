"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { X, ChevronLeft, ChevronRight, Maximize, ZoomIn, ZoomOut, Download, Share2, Link, EllipsisVertical } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { cn } from '@/lib/utils';
import { EncryptedImage } from './encrypted-image';
import { isSvgUrl } from '@/lib/svg-sanitizer';
import { downloadImage, shareImage, downloadImageBlob, shareImageBlob } from '@/lib/capacitor/share';
import { ResponsiveMenu, ResponsiveMenuTrigger, ResponsiveMenuContent, ResponsiveMenuItem } from './responsive-menu';
import { useToast } from '@/hooks/use-toast';
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

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const DOUBLE_TAP_SCALE = 2.5;

/**
 * Inner toolbar component — uses useControls() from react-zoom-pan-pinch
 * to get programmatic access to zoom/reset functions.
 */
function ZoomToolbar({ scale, wrapperRef }: { scale: number; wrapperRef: React.RefObject<React.ComponentRef<typeof TransformWrapper> | null> }) {
  const zoomPercent = Math.round(scale * 100);
  const isZoomed = scale > 1.05;

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    wrapperRef.current?.zoomIn();
  };
  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    wrapperRef.current?.zoomOut();
  };
  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    wrapperRef.current?.resetTransform();
  };

  return (
    <div
      className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-full px-2 py-1.5 shadow-lg"
    >
      <button
        onClick={handleZoomOut}
        disabled={scale <= MIN_SCALE}
        className="p-1.5 text-white/80 hover:text-white disabled:text-white/30 transition-colors rounded-full hover:bg-white/10"
        aria-label="Zoom out"
      >
        <ZoomOut className="h-4 w-4" />
      </button>

      <span className="text-white/70 text-xs font-mono min-w-[3rem] text-center tabular-nums">
        {zoomPercent}%
      </span>

      <button
        onClick={handleZoomIn}
        disabled={scale >= MAX_SCALE}
        className="p-1.5 text-white/80 hover:text-white disabled:text-white/30 transition-colors rounded-full hover:bg-white/10"
        aria-label="Zoom in"
      >
        <ZoomIn className="h-4 w-4" />
      </button>

      {isZoomed && (
        <button
          onClick={handleReset}
          className="p-1.5 text-white/80 hover:text-white transition-colors rounded-full hover:bg-white/10 ml-0.5 border-l border-white/20 pl-2"
          aria-label="Fit to screen"
        >
          <Maximize className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function ImageLightbox({ images, initialIndex = 0, open, onOpenChange, isEncrypted, postId, ring, tribeId }: ImageLightboxProps) {
  const { toast } = useToast();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  // For encrypted images, the decrypted pixels live in a Blob (no fetchable URL),
  // lifted up from <EncryptedImage> so Save/Share can operate on it.
  const [currentBlob, setCurrentBlob] = useState<Blob | null>(null);
  const transformWrapperRef = useRef<React.ComponentRef<typeof TransformWrapper>>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const isZoomed = scale > 1.05;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || isZoomed || images.length <= 1) return;
    const deltaX = touchStartX.current - e.changedTouches[0].clientX;
    const deltaY = touchStartY.current! - e.changedTouches[0].clientY;
    touchStartX.current = null;
    if (Math.abs(deltaX) < 60 || Math.abs(deltaX) < Math.abs(deltaY)) return;
    deltaX > 0
      ? setCurrentIndex(prev => (prev < images.length - 1 ? prev + 1 : 0))
      : setCurrentIndex(prev => (prev > 0 ? prev - 1 : images.length - 1));
  };

  // Reset everything when dialog opens or index changes
  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
      setScale(1);
    }
  }, [open, initialIndex]);

  // Reset zoom when changing slides
  useEffect(() => {
    setScale(1);
    transformWrapperRef.current?.resetTransform();
    // Drop the previous slide's decrypted blob; the new slide re-supplies it.
    setCurrentBlob(null);
  }, [currentIndex]);

  // ── Keyboard navigation ──────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'ArrowLeft') {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
      } else if (e.key === 'ArrowRight') {
        setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'Escape') {
        onOpenChange(false);
      } else if (e.key === '+' || e.key === '=') {
        transformWrapperRef.current?.zoomIn();
      } else if (e.key === '-') {
        transformWrapperRef.current?.zoomOut();
      } else if (e.key === '0') {
        transformWrapperRef.current?.resetTransform();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, images.length, onOpenChange]);

  // Browser back button / swipe-back closes lightbox
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ lightbox: true }, '');
    const handlePopState = () => {
      onOpenChange(false);
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (window.history.state?.lightbox) {
        window.history.back();
      }
    };
  }, [open, onOpenChange]);

  // Handle backdrop click (close only when not zoomed)
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isZoomed) {
      onOpenChange(false);
    }
  }, [isZoomed, onOpenChange]);

  if (!images || images.length === 0) return null;

  const currentUrl = images[currentIndex];
  const currentIsSvg = !isEncrypted && isSvgUrl(currentUrl);
  // SVGs are always rendered via <img>. Browsers render SVG <img> tags as full vectors (crisp at
  // any zoom), while <object> creates a browsing context that inherits color-scheme from the OS —
  // causing dark-mode SVGs with light-dark() fills to render as black boxes.

  // ── Image actions (Save / Share / Copy) ─────────────────────────────
  // Encrypted images have no fetchable URL — their pixels are in `currentBlob`
  // (E2E means private, not un-shareable: members can save/share, screenshots exist).
  // For encrypted images `currentUrl` is the fileId; the shareable link is the
  // auth-gated same-origin proxy that only members can open.
  const encryptedFileName = `${currentUrl}.jpg`;
  const copyLinkTarget = isEncrypted
    ? `${window.location.origin}/api/media/${currentUrl}`
    : currentUrl;
  const encryptedNotReady = isEncrypted && !currentBlob;

  const handleSaveImage = async () => {
    const ok = isEncrypted
      ? await downloadImageBlob(currentBlob!, encryptedFileName)
      : await downloadImage(currentUrl);
    if (ok) toast({ title: 'Image saved' });
    else toast({ title: 'Save failed', description: 'Could not save the image.', variant: 'destructive' });
  };

  const handleShareImage = async () => {
    const ok = isEncrypted
      ? await shareImageBlob(currentBlob!, encryptedFileName)
      : await shareImage(currentUrl);
    if (!ok) toast({ title: 'Share failed', description: 'Could not complete the share.', variant: 'destructive' });
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(copyLinkTarget)
      .then(() => toast({ title: 'Link copied', description: 'Image URL copied to clipboard.' }))
      .catch((err) => {
        console.warn('[lightbox] Copy link failed:', err);
        toast({ title: 'Copy failed', description: 'Could not access clipboard.', variant: 'destructive' });
      });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[100vw] max-h-[100vh] w-screen h-screen p-0 m-0 bg-black/95 border-none shadow-none rounded-none flex flex-col justify-center items-center gap-0 overflow-hidden [&>button:last-child]:hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="sr-only">
            <DialogTitle>Image Viewer</DialogTitle>
            <DialogDescription>View post images in full screen. Pinch or scroll to zoom, drag to pan.</DialogDescription>
        </div>

        {/* Close button — safe zone on mobile */}
        <button
            onClick={() => onOpenChange(false)}
            className="absolute top-[max(1rem,env(safe-area-inset-top,16px))] right-4 sm:top-6 sm:right-6 z-50 p-3 bg-black/50 hover:bg-black/70 active:bg-black/80 rounded-full text-white/90 hover:text-white transition-colors"
            aria-label="Close image viewer"
        >
          <X className="h-7 w-7 sm:h-6 sm:w-6" />
        </button>

        {/* Action menu — top-left. Available for encrypted images too: E2E means
            private, not un-shareable (members can save/share; screenshots exist). */}
        <div className="absolute top-[max(1rem,env(safe-area-inset-top,16px))] left-4 sm:top-6 sm:left-6 z-50">
          <ResponsiveMenu>
            <ResponsiveMenuTrigger asChild>
              <button
                className="p-3 bg-black/50 hover:bg-black/70 active:bg-black/80 rounded-full text-white/90 hover:text-white transition-colors"
                aria-label="Image actions"
                onClick={(e) => e.stopPropagation()}
              >
                <EllipsisVertical className="h-7 w-7 sm:h-6 sm:w-6" />
              </button>
            </ResponsiveMenuTrigger>
            <ResponsiveMenuContent align="start">
              <ResponsiveMenuItem disabled={encryptedNotReady} onClick={handleSaveImage}>
                <Download className="h-4 w-4 mr-2" />
                Save Image
              </ResponsiveMenuItem>
              <ResponsiveMenuItem disabled={encryptedNotReady} onClick={handleShareImage}>
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </ResponsiveMenuItem>
              <ResponsiveMenuItem onClick={handleCopyLink}>
                <Link className="h-4 w-4 mr-2" />
                Copy Link
              </ResponsiveMenuItem>
            </ResponsiveMenuContent>
          </ResponsiveMenu>
        </div>

        {/* Navigation arrows (multi-image, hidden when zoomed) */}
        {images.length > 1 && !isZoomed && (
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

        {/* Image container with zoom/pan via react-zoom-pan-pinch */}
        <TransformWrapper
          ref={transformWrapperRef}
          key={currentIndex} // Reset zoom state when changing images
          initialScale={1}
          minScale={MIN_SCALE}
          maxScale={MAX_SCALE}
          centerOnInit
          doubleClick={{ step: DOUBLE_TAP_SCALE - 1 }}
          wheel={{ step: 0.08 }}
          onTransform={(_, state) => {
            setScale(state.scale);
          }}
        >
          <div
            className="relative w-full h-full flex items-center justify-center select-none"
            onClick={handleBackdropClick}
          >
            <TransformComponent
              wrapperStyle={{
                width: '100%',
                height: '100%',
              }}
              contentStyle={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isEncrypted && postId ? (
                <EncryptedImage
                  fileId={images[currentIndex]}
                  postId={postId}
                  ring={ring}
                  tribeId={tribeId}
                  onBlobReady={setCurrentBlob}
                  className="max-w-full max-h-[90vh] object-contain pointer-events-auto shadow-2xl"
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img 
                  src={currentUrl} 
                  alt={`Image ${currentIndex + 1} of ${images.length}`} 
                  className={cn(
                    "object-contain pointer-events-auto shadow-2xl",
                    currentIsSvg
                      ? "w-[90vw] h-[90vh]"  // SVGs need explicit dimensions (viewBox-only SVGs lack intrinsic size)
                      : "max-w-full max-h-[90vh]"
                  )}
                  draggable={false}
                />
              )}
            </TransformComponent>
          </div>
        </TransformWrapper>

        {/* Zoom toolbar — positioned against DialogContent (viewport), not the inner flex child */}
        <ZoomToolbar scale={scale} wrapperRef={transformWrapperRef} />

        {/* Dot indicators (multi-image, hidden when zoomed) */}
        {images.length > 1 && !isZoomed && (
            <div className="absolute bottom-14 sm:bottom-16 left-1/2 -translate-x-1/2 z-50 flex gap-2">
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

        {/* Touch hint — shown on mobile when not zoomed */}
        {!isZoomed && (
          <div className="absolute bottom-20 sm:bottom-24 left-1/2 -translate-x-1/2 z-50 text-white/20 text-[10px] sm:text-xs pointer-events-none text-center">
            <span className="sm:hidden">Double-tap or pinch to zoom</span>
            <span className="hidden sm:inline">Scroll to zoom · Double-click to magnify</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
