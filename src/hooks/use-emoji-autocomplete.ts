"use client";

import { useState, useRef, useCallback, type RefObject } from "react";
import type { EmojiAutocompleteRef } from "@/components/compose/emoji-autocomplete";

/**
 * Encapsulates emoji shortcode detection, selection, and keyboard navigation
 * for any textarea that supports ::shortcode:: autocomplete.
 *
 * Designed as a direct counterpart to useMentionAutocomplete. Same API shape,
 * same wiring pattern, but triggered by `::` instead of `@`.
 *
 * Usage:
 *   const { emojiQuery, emojiRef, checkEmoji, handleSelectEmoji, handleEmojiKeyDown, resetEmoji } =
 *     useEmojiAutocomplete(textareaRef, content, setContent);
 *
 *   <Textarea
 *     onChange={e => { setContent(e.target.value); checkEmoji(e.target.value, e.target.selectionStart); }}
 *     onKeyDown={handleEmojiKeyDown}
 *   />
 *   <EmojiAutocomplete ref={emojiRef} query={emojiQuery} onSelect={handleSelectEmoji} />
 */
export function useEmojiAutocomplete(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  content: string,
  setContent: (val: string) => void,
) {
  const [emojiQuery, setEmojiQuery] = useState<string | null>(null);
  const emojiRef = useRef<EmojiAutocompleteRef>(null);

  const checkEmoji = useCallback((text: string, selStart: number) => {
    const textBeforeCursor = text.substring(0, selStart);

    const lastTriggerIdx = textBeforeCursor.lastIndexOf("::");
    if (lastTriggerIdx === -1) {
      setEmojiQuery(null);
      return;
    }

    const textAfterTrigger = textBeforeCursor.substring(lastTriggerIdx + 2);

    // Whitespace breaks the shortcode, user has moved on
    if (/\s/.test(textAfterTrigger)) {
      setEmojiQuery(null);
      return;
    }

    // A closing `::` means the shortcode was completed manually (e.g. `::joy::`)
    if (textAfterTrigger.includes("::")) {
      setEmojiQuery(null);
      return;
    }

    // Trigger must be at start-of-string or after whitespace (same rule as @mentions)
    if (lastTriggerIdx > 0 && !/\s/.test(textBeforeCursor.charAt(lastTriggerIdx - 1))) {
      setEmojiQuery(null);
      return;
    }

    setEmojiQuery(textAfterTrigger);
  }, []);

  const handleSelectEmoji = useCallback(
    (emoji: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const selStart = textarea.selectionStart ?? content.length;
      const textBeforeCursor = content.substring(0, selStart);
      const lastTriggerIdx = textBeforeCursor.lastIndexOf("::");

      if (lastTriggerIdx !== -1) {
        // Replace `::query` with the native emoji character + trailing space
        const textAfterCursor = content.substring(selStart);
        const newContent =
          content.substring(0, lastTriggerIdx) + emoji + " " + textAfterCursor;
        setContent(newContent);
        setEmojiQuery(null);

        const newCursorPos = lastTriggerIdx + emoji.length + 1;
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 10);
      }
    },
    [textareaRef, content, setContent],
  );

  const handleEmojiKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (emojiQuery !== null && emojiRef.current) {
        const handled = emojiRef.current.handleKeyDown(e);
        if (handled) {
          e.preventDefault();
        }
      }
    },
    [emojiQuery],
  );

  const resetEmoji = useCallback(() => {
    setEmojiQuery(null);
  }, []);

  return {
    emojiQuery,
    emojiRef,
    checkEmoji,
    handleSelectEmoji,
    handleEmojiKeyDown,
    resetEmoji,
  };
}
