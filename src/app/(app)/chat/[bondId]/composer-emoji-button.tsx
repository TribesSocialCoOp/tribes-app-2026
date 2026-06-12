"use client";

/**
 * ComposerEmojiButton — smiley button in the chat input area that opens
 * the full emoji picker (Popover on desktop, Drawer on mobile — same
 * split as VibePicker) and inserts the chosen emoji at the cursor.
 */

import React, { useState } from 'react';
import EmojiPicker, { EmojiClickData, Theme, EmojiStyle } from 'emoji-picker-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Smile } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

interface ComposerEmojiButtonProps {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
}

export function ComposerEmojiButton({ onSelect, disabled }: ComposerEmojiButtonProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const isMobile = useIsMobile();

  React.useEffect(() => {
    if (popoverOpen || drawerOpen) {
      setIsDark(
        window.matchMedia('(prefers-color-scheme: dark)').matches ||
        document.documentElement.classList.contains('dark')
      );
    }
  }, [popoverOpen, drawerOpen]);

  const handleSelect = (d: EmojiClickData) => {
    onSelect(d.emoji);
    setPopoverOpen(false);
    setDrawerOpen(false);
  };

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="shrink-0"
      disabled={disabled}
      title="Insert emoji"
      onClick={isMobile ? () => setDrawerOpen(true) : undefined}
    >
      <Smile className="h-4 w-4" />
    </Button>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerContent className="px-0 pb-safe">
            <DrawerTitle className="sr-only">Choose an emoji</DrawerTitle>
            <div className="flex justify-center w-full px-2 py-3">
              <EmojiPicker
                onEmojiClick={handleSelect}
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

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="w-auto p-1"
        side="top"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <EmojiPicker
          onEmojiClick={handleSelect}
          theme={isDark ? Theme.DARK : Theme.LIGHT}
          emojiStyle={EmojiStyle.NATIVE}
          height={350}
          width={320}
          searchPlaceholder="Search emoji..."
          previewConfig={{ showPreview: false }}
          lazyLoadEmojis
          autoFocusSearch={true}
        />
      </PopoverContent>
    </Popover>
  );
}
