"use client";

import React, { useState } from 'react';
import EmojiPicker, { EmojiClickData, Theme, EmojiStyle } from 'emoji-picker-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Smile, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VIBE_EMOTICONS } from '@/lib/constants';
import { useIsMobile } from '@/hooks/use-mobile';

interface VibePickerProps {
  /** Current vibe count to display */
  vibeCount: number;
  /** Top emoji reactions to display on the trigger button */
  recentVibes?: { emoji: string; count: number }[];
  /** Detailed reactor info (only populated for content authors) */
  vibeDetails?: { emoji: string; userName: string; userId: string }[];
  /** Whether the current user has already vibed */
  hasVibed?: boolean;
  /** Whether the viewer authored this content (shows "who reacted" UI) */
  isAuthor?: boolean;
  /** Called when the user selects an emoji */
  onVibeSelect: (emoji: string) => void;
  /** Whether the picker is disabled (e.g. for non-post items) */
  disabled?: boolean;
}

/**
 * VibePicker — two-tier emoji interaction:
 *
 * 1. Quick-pick row: Always a floating Popover (conventional, no keyboard
 *    triggered because there's no search input).
 * 2. "More" full picker:
 *    • Desktop → expands within the same Popover.
 *    • Mobile  → closes the Popover, opens a full-width Drawer so the
 *      emoji grid gets proper space and the search field is safe from
 *      keyboard focus-theft.
 *
 * When isAuthor is true & reactions exist:
 *    • Desktop → Tooltip showing who reacted.
 *    • Mobile  → Drawer showing who reacted + quick-react bar.
 */
export function VibePicker({
  vibeCount,
  recentVibes = [],
  vibeDetails,
  hasVibed = false,
  isAuthor = false,
  onVibeSelect,
  disabled = false,
}: VibePickerProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [pickerHeight, setPickerHeight] = useState(420);
  const [drawerContentMode, setDrawerContentMode] = useState<'details' | 'picker'>('details');
  const isMobile = useIsMobile();

  // Track visual viewport height to dynamically size the emoji picker
  // when the iOS virtual keyboard appears. On iOS Safari, the visual
  // viewport shrinks but the layout viewport doesn't, so we listen to
  // visualViewport.resize to calculate available space. In Capacitor,
  // the --keyboard-height CSS variable (set by native-initializer.tsx)
  // gives precise keyboard dimensions, so we use both signals. We also
  // observe style attribute mutations on <html> to catch the Capacitor
  // Keyboard plugin setting --keyboard-height via setProperty().
  React.useEffect(() => {
    if (!drawerOpen) return;
    const vv = window.visualViewport;

    const update = () => {
      // Read the Capacitor keyboard-height variable (set on iOS, zeroed on Android)
      const kbHeight = parseInt(
        getComputedStyle(document.documentElement)
          .getPropertyValue('--keyboard-height') || '0',
        10,
      ) || 0;
      // Use visual viewport if available, otherwise fall back to innerHeight
      const viewportH = vv ? vv.height : window.innerHeight;
      // Available height = smaller of visual viewport and (full height minus keyboard)
      // minus drawer chrome (~100px for handle, padding, safe area)
      const available = Math.min(viewportH, window.innerHeight - kbHeight) - 100;
      setPickerHeight(Math.max(200, Math.min(420, available)));
    };

    update();

    // visualViewport resize (Safari, Chrome mobile)
    vv?.addEventListener('resize', update);

    // Observe --keyboard-height changes from Capacitor keyboard plugin
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'style') update();
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });

    return () => {
      vv?.removeEventListener('resize', update);
      observer.disconnect();
    };
  }, [drawerOpen]);

  // Detect dark mode on first open
  React.useEffect(() => {
    if (popoverOpen || drawerOpen) {
      setIsDark(
        window.matchMedia('(prefers-color-scheme: dark)').matches ||
        document.documentElement.classList.contains('dark')
      );
    }
  }, [popoverOpen, drawerOpen]);

  const handleSelect = (emoji: string) => {
    onVibeSelect(emoji);
    setPopoverOpen(false);
    setDrawerOpen(false);
    setShowFullPicker(false);
  };

  const handleFullPickerSelect = (emojiData: EmojiClickData) => {
    handleSelect(emojiData.emoji);
  };

  const handleMoreClick = () => {
    if (isMobile) {
      // Close the floating popover, open a proper drawer
      setDrawerContentMode('picker');
      setPopoverOpen(false);
      setDrawerOpen(true);
    } else {
      // Expand within the popover on desktop
      setShowFullPicker(true);
    }
  };

  // ── Trigger button (shared between all modes) ──
  const triggerButton = (
    <Button
      variant="ghost"
      size="sm"
      disabled={disabled}
      className={cn(
        "text-muted-foreground hover:text-primary transition-all",
        hasVibed && "bg-primary/10 text-primary",
      )}
    >
      {recentVibes.length > 0 ? (
        <div className="flex -space-x-1.5 mr-2">
          {recentVibes.map((rv, i) => (
            <span
              key={i}
              className="text-base z-10 bg-background rounded-full leading-none p-[1px] shadow-sm relative"
            >
              {rv.emoji}
            </span>
          ))}
        </div>
      ) : (
        <Smile className="mr-1.5 h-4 w-4" />
      )}
      {vibeCount}
    </Button>
  );

  // ── Author mode: mobile opens drawer, desktop shows tooltip ──
  if (isAuthor && recentVibes.length > 0) {
    return (
      <>
        {isMobile ? (
          // Mobile: tap opens author drawer
          <div onClick={() => {
            setDrawerContentMode('details');
            setDrawerOpen(true);
          }}>
            {triggerButton}
          </div>
        ) : (
          // Desktop: tap/click opens premium popover
          <Popover open={popoverOpen} onOpenChange={(isOpen) => {
            setPopoverOpen(isOpen);
            if (!isOpen) setShowFullPicker(false);
          }}>
            <PopoverTrigger asChild>
              {triggerButton}
            </PopoverTrigger>
            <PopoverContent
              className="w-80 p-0"
              side="top"
              align="start"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <div className="flex flex-col">
                <div className="text-center font-semibold text-sm py-2.5 border-b">
                  Reactions
                </div>
                
                {/* Quick-react bar */}
                <div className="py-2.5 px-3 border-b bg-muted/20">
                  <p className="text-[10px] text-muted-foreground mb-1.5 text-center">Add a reaction</p>
                  <div className="flex space-x-1.5 justify-center">
                    {VIBE_EMOTICONS.map((emo) => (
                      <Button
                        key={emo}
                        variant="ghost"
                        size="icon"
                        className={cn("text-lg p-1 h-8 w-8 rounded-full hover:bg-accent", hasVibed && "bg-primary/10 border border-primary/20")}
                        onClick={() => handleSelect(emo)}
                      >
                        {emo}
                      </Button>
                    ))}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-xs p-1 h-8 w-8 rounded-full hover:bg-accent text-muted-foreground"
                      onClick={() => setShowFullPicker(true)}
                      aria-label="More emoji"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {showFullPicker ? (
                  <div className="p-2 border-b">
                    <EmojiPicker
                      onEmojiClick={handleFullPickerSelect}
                      theme={isDark ? Theme.DARK : Theme.LIGHT}
                      emojiStyle={EmojiStyle.NATIVE}
                      height={320}
                      width="100%"
                      searchPlaceholder="Search emoji..."
                      previewConfig={{ showPreview: false }}
                      lazyLoadEmojis
                      autoFocusSearch={true}
                    />
                    <Button 
                      variant="link" 
                      size="sm" 
                      className="w-full text-xs mt-1 text-muted-foreground"
                      onClick={() => setShowFullPicker(false)}
                    >
                      Back to reactions list
                    </Button>
                  </div>
                ) : (
                  /* Reaction list */
                  <div className="overflow-y-auto max-h-[240px] p-2 space-y-1">
                    {vibeDetails && vibeDetails.length > 0 ? (
                      vibeDetails.map((v, i) => (
                        <div key={i} className="flex items-center justify-between py-1.5 px-2 hover:bg-muted/40 rounded-md">
                          <span className="text-xs font-medium text-foreground">{v.userName}</span>
                          <span className="text-base">{v.emoji}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-4">No reactions yet</p>
                    )}
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {/*
          Author-mode Drawer (mobile only)
          ─────────────────────────────────
          USE CASE: Content authors tapping the vibe button see a combined drawer
          with two modes (toggled via `drawerContentMode`):
            • 'details' — Shows the list of who reacted, plus a quick-react bar
                          and a "More" button to switch to the picker.
            • 'picker'  — Full emoji grid for searching/selecting any emoji.
          This is intentionally a separate Drawer from the standard-mode picker
          below because it serves a richer, author-specific UX (reactor identity
          + quick-react + full picker in one surface). Do not consolidate.
        */}
        {isMobile && (
          <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
            <DrawerContent className={cn("pb-safe max-h-[85vh]", drawerContentMode === 'picker' ? "px-0" : "px-4")}>
              {drawerContentMode === 'picker' ? (
                <>
                  <DrawerTitle className="sr-only">Choose an emoji</DrawerTitle>
                  <div className="flex justify-center w-full px-2 py-3">
                    <EmojiPicker
                      onEmojiClick={handleFullPickerSelect}
                      theme={isDark ? Theme.DARK : Theme.LIGHT}
                      emojiStyle={EmojiStyle.NATIVE}
                      height={pickerHeight}
                      width="100%"
                      searchPlaceholder="Search emoji..."
                      previewConfig={{ showPreview: false }}
                      lazyLoadEmojis
                      autoFocusSearch={false}
                    />
                  </div>
                  <Button 
                    variant="link" 
                    size="sm" 
                    className="w-full text-xs mb-2 text-muted-foreground"
                    onClick={() => setDrawerContentMode('details')}
                  >
                    Back to reactions list
                  </Button>
                </>
              ) : (
                <>
                  <DrawerTitle className="text-center font-semibold text-base py-3 border-b">
                    Reactions
                  </DrawerTitle>
                  
                  {/* Quick-react bar */}
                  <div className="py-4 border-b">
                    <p className="text-xs text-muted-foreground mb-2 text-center">Add a reaction</p>
                    <div className="flex space-x-2 justify-center items-center">
                      {VIBE_EMOTICONS.map((emo) => (
                        <Button
                          key={emo}
                          variant="ghost"
                          size="icon"
                          className={cn("text-2xl p-2 h-11 w-11 rounded-full", hasVibed && "bg-primary/10 border border-primary/20")}
                          onClick={() => handleSelect(emo)}
                        >
                          {emo}
                        </Button>
                      ))}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-xs p-2 h-11 w-11 rounded-full hover:bg-accent text-muted-foreground flex items-center justify-center"
                        onClick={() => {
                          setDrawerContentMode('picker');
                        }}
                        aria-label="More emoji"
                      >
                        <MoreVertical className="h-6 w-6" />
                      </Button>
                    </div>
                  </div>

                  {/* Reaction list */}
                  <div className="overflow-y-auto py-4 space-y-3 max-h-[40vh]">
                    {vibeDetails && vibeDetails.length > 0 ? (
                      vibeDetails.map((v, i) => (
                        <div key={i} className="flex items-center justify-between py-1 px-2 hover:bg-muted/40 rounded-lg">
                          <span className="text-sm font-medium text-foreground">{v.userName}</span>
                          <span className="text-xl">{v.emoji}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">No reactions yet</p>
                    )}
                  </div>
                </>
              )}
            </DrawerContent>
          </Drawer>
        )}
      </>
    );
  }

  // ── Standard mode: emoji picker (non-authors or no reactions) ──
  return (
    <>
      {/* ── Quick-pick floating popover (all platforms) ── */}
      <Popover open={popoverOpen} onOpenChange={(isOpen) => {
        setPopoverOpen(isOpen);
        if (!isOpen) setShowFullPicker(false);
      }}>
        <PopoverTrigger asChild>
          {triggerButton}
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-2"
          side="top"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {showFullPicker && !isMobile ? (
            <EmojiPicker
              onEmojiClick={handleFullPickerSelect}
              theme={isDark ? Theme.DARK : Theme.LIGHT}
              emojiStyle={EmojiStyle.NATIVE}
              height={350}
              width={320}
              searchPlaceholder="Search emoji..."
              previewConfig={{ showPreview: false }}
              lazyLoadEmojis
              autoFocusSearch={true}
            />
          ) : (
            <div className="flex space-x-1 justify-center py-2">
              {VIBE_EMOTICONS.map((emo) => (
                <Button
                  key={emo}
                  variant="ghost"
                  size="icon"
                  className="text-xl p-1.5 h-auto w-auto rounded-md hover:bg-accent"
                  onClick={() => handleSelect(emo)}
                >
                  {emo}
                </Button>
              ))}
              <Button
                variant="ghost"
                size="icon"
                className="text-sm p-1.5 h-auto w-auto rounded-md hover:bg-accent text-muted-foreground"
                onClick={handleMoreClick}
                aria-label="More emoji"
              >
                <MoreVertical className="h-5 w-5" />
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/*
        Standard-mode Drawer (mobile only)
        ───────────────────────────────────
        USE CASE: Non-author users (or authors with zero reactions) tapping
        "More" on the quick-pick popover get a simple full-width emoji picker
        drawer. No reactor list, no mode toggle — just the grid.
        This is intentionally a separate Drawer from the author-mode drawer
        above because it serves a simpler, single-purpose UX. Do not consolidate.
      */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="px-0 pb-safe">
          <DrawerTitle className="sr-only">Choose an emoji</DrawerTitle>
          <div className="flex justify-center w-full px-2 py-3">
            <EmojiPicker
              onEmojiClick={handleFullPickerSelect}
              theme={isDark ? Theme.DARK : Theme.LIGHT}
              emojiStyle={EmojiStyle.NATIVE}
              height={pickerHeight}
              width="100%"
              searchPlaceholder="Search emoji..."
              previewConfig={{ showPreview: false }}
              lazyLoadEmojis
              autoFocusSearch={false}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
