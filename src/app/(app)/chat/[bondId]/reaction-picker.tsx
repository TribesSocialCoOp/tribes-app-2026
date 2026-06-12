"use client";

/**
 * ReactionPicker — quick-react bar for chat messages.
 *
 * Follows the VibePicker pattern: a quick-pick row in a Popover, with a
 * "+" button that expands to the full EmojiPicker (inline on desktop,
 * full-width Drawer on mobile so the search field is safe from
 * keyboard focus-theft).
 */

import React, { useState } from 'react';
import EmojiPicker, { EmojiClickData, Theme, EmojiStyle } from 'emoji-picker-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Plus } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🤔', '😢', '🔥'];

interface ReactionPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the chosen emoji; the picker closes itself. */
  onSelect: (emoji: string) => void;
  /** Align the popover with the message bubble side */
  align?: 'start' | 'end';
  children: React.ReactNode;
}

export function ReactionPicker({ open, onOpenChange, onSelect, align = 'start', children }: ReactionPickerProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const isMobile = useIsMobile();

  React.useEffect(() => {
    if (open || drawerOpen) {
      setIsDark(
        window.matchMedia('(prefers-color-scheme: dark)').matches ||
        document.documentElement.classList.contains('dark')
      );
    }
  }, [open, drawerOpen]);

  const handleSelect = (emoji: string) => {
    onSelect(emoji);
    onOpenChange(false);
    setDrawerOpen(false);
    setShowFullPicker(false);
  };

  const handleMoreClick = () => {
    if (isMobile) {
      // Close the floating popover, open a proper drawer
      onOpenChange(false);
      setDrawerOpen(true);
    } else {
      setShowFullPicker(true);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) setShowFullPicker(false);
      }}>
        <PopoverAnchor asChild>
          {children}
        </PopoverAnchor>
        <PopoverContent
          className="w-auto p-2"
          side="top"
          align={align}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {showFullPicker && !isMobile ? (
            <EmojiPicker
              onEmojiClick={(d: EmojiClickData) => handleSelect(d.emoji)}
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
            <div className="flex space-x-1 justify-center py-1">
              {QUICK_REACTIONS.map((emo) => (
                <Button
                  key={emo}
                  variant="ghost"
                  size="icon"
                  className="text-xl p-1.5 h-auto w-auto rounded-full hover:bg-accent"
                  onClick={() => handleSelect(emo)}
                >
                  {emo}
                </Button>
              ))}
              <Button
                variant="ghost"
                size="icon"
                className="text-sm p-1.5 h-auto w-auto rounded-full hover:bg-accent text-muted-foreground"
                onClick={handleMoreClick}
                aria-label="More emoji"
              >
                <Plus className="h-5 w-5" />
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Mobile full-picker drawer */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="px-0 pb-safe">
          <DrawerTitle className="sr-only">Choose a reaction</DrawerTitle>
          <div className="flex justify-center w-full px-2 py-3">
            <EmojiPicker
              onEmojiClick={(d: EmojiClickData) => handleSelect(d.emoji)}
              theme={isDark ? Theme.DARK : Theme.LIGHT}
              emojiStyle={EmojiStyle.NATIVE}
              height={350}
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
