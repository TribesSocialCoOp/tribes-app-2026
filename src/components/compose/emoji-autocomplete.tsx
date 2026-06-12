/**
 * Emoji shortcode autocomplete dropdown.
 *
 * Structural counterpart to MentionAutocomplete. Same positioning, keyboard
 * delegation pattern (useImperativeHandle), and visual styling. The key
 * difference is that all filtering is synchronous against the local gemoji
 * dataset, so there is no loading state or debounced fetch.
 *
 * Rendered inside the same `relative z-50` container as the textarea and
 * positioned via `absolute top-full` so it floats directly below the input.
 */

import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { searchEmoji, type EmojiSearchResult } from '@/lib/emoji-data';

export interface EmojiAutocompleteProps {
  query: string | null;
  onSelect: (emoji: string) => void;
  className?: string;
  /** Shared with MentionAutocomplete. Suppresses keyboard-hide on iOS during selection. */
  suppressRef?: React.RefObject<boolean | null>;
}

export interface EmojiAutocompleteRef {
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => boolean;
}

export const EmojiAutocomplete = forwardRef<EmojiAutocompleteRef, EmojiAutocompleteProps>(
  ({ query, onSelect, className, suppressRef }, ref) => {
    const [suggestions, setSuggestions] = useState<EmojiSearchResult[]>([]);
    const [activeIdx, setActiveIdx] = useState<number>(0);

    useEffect(() => {
      if (query === null || query.trim() === '') {
        setSuggestions([]);
        return;
      }

      const results = searchEmoji(query);
      setSuggestions(results);
      setActiveIdx(0);
    }, [query]);

    const handleSelect = (emoji: string) => {
      if (suppressRef) suppressRef.current = true;
      onSelect(emoji);
      if (suppressRef) {
        setTimeout(() => {
          suppressRef.current = false;
        }, 200);
      }
    };

    useImperativeHandle(ref, () => ({
      handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) {
        if (!query || suggestions.length === 0) return false;

        switch (e.key) {
          case 'ArrowDown':
            setActiveIdx((prev) => (prev + 1) % suggestions.length);
            return true;
          case 'ArrowUp':
            setActiveIdx((prev) => (prev - 1 + suggestions.length) % suggestions.length);
            return true;
          case 'Enter':
          case 'Tab':
            if (suggestions[activeIdx]) {
              handleSelect(suggestions[activeIdx].emoji);
              return true;
            }
            return false;
          case 'Escape':
            setSuggestions([]);
            return true;
          default:
            return false;
        }
      },
    }));

    if (query === null || suggestions.length === 0) {
      return null;
    }

    return (
      <div
        className={cn(
          "absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md animate-in fade-in slide-in-from-top-2 duration-200",
          className
        )}
      >
        <ul role="listbox" className="space-y-0.5">
          {suggestions.map((result, idx) => (
            <li
              key={result.shortcode}
              role="option"
              aria-selected={idx === activeIdx}
              className={cn(
                "flex items-center gap-3 cursor-pointer rounded-md px-3 py-2 text-sm transition-colors",
                idx === activeIdx
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground hover:bg-muted"
              )}
              onPointerDown={() => {
                if (suppressRef) suppressRef.current = true;
              }}
              onClick={() => handleSelect(result.emoji)}
              onMouseEnter={() => setActiveIdx(idx)}
            >
              <span className="text-xl leading-none">{result.emoji}</span>
              <span className="text-muted-foreground text-xs">:{result.shortcode}:</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
);

EmojiAutocomplete.displayName = 'EmojiAutocomplete';
