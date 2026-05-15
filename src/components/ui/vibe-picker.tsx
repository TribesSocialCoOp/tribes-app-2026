"use client";

import React, { useState } from 'react';
import EmojiPicker, { EmojiClickData, Theme, EmojiStyle } from 'emoji-picker-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Smile, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VIBE_EMOTICONS } from '@/lib/constants';
import { useIsMobile } from '@/hooks/use-mobile';

interface VibePickerProps {
  /** Current vibe count to display */
  vibeCount: number;
  /** Top emoji reactions to display on the trigger button */
  recentVibes?: { emoji: string; count: number }[];
  /** Whether the current user has already vibed */
  hasVibed?: boolean;
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
 */
export function VibePicker({
  vibeCount,
  recentVibes = [],
  hasVibed = false,
  onVibeSelect,
  disabled = false,
}: VibePickerProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const isMobile = useIsMobile();

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
      setPopoverOpen(false);
      setDrawerOpen(true);
    } else {
      // Expand within the popover on desktop
      setShowFullPicker(true);
    }
  };

  return (
    <>
      {/* ── Quick-pick floating popover (all platforms) ── */}
      <Popover open={popoverOpen} onOpenChange={(isOpen) => {
        setPopoverOpen(isOpen);
        if (!isOpen) setShowFullPicker(false);
      }}>
        <PopoverTrigger asChild>
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
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* ── Full emoji picker drawer (mobile only) ── */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="px-0 pb-safe">
          <DrawerTitle className="sr-only">Choose an emoji</DrawerTitle>
          <div className="flex justify-center w-full px-2 py-3">
            <EmojiPicker
              onEmojiClick={handleFullPickerSelect}
              theme={isDark ? Theme.DARK : Theme.LIGHT}
              emojiStyle={EmojiStyle.NATIVE}
              height={420}
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
