"use client";

import { useState, useRef, useCallback, type RefObject } from "react";
import type { MentionAutocompleteRef } from "@/components/compose/mention-autocomplete";

/**
 * Encapsulates mention detection, selection, and keyboard navigation logic
 * for any textarea that supports @mention autocomplete.
 *
 * Usage:
 *   const { mentionQuery, mentionRef, checkMention, handleSelectMention, handleMentionKeyDown } =
 *     useMentionAutocomplete(textareaRef, content, setContent);
 *
 *   <Textarea onChange={e => { setContent(e.target.value); checkMention(e.target.value, e.target.selectionStart); }} onKeyDown={handleMentionKeyDown} />
 *   <MentionAutocomplete ref={mentionRef} query={mentionQuery} onSelect={handleSelectMention} />
 */
export function useMentionAutocomplete(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  content: string,
  setContent: (val: string) => void,
) {
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const mentionRef = useRef<MentionAutocompleteRef>(null);

  const checkMention = useCallback((text: string, selStart: number) => {
    const textBeforeCursor = text.substring(0, selStart);
    const lastAtIdx = textBeforeCursor.lastIndexOf("@");
    if (lastAtIdx === -1) {
      setMentionQuery(null);
      return;
    }

    const textBetween = textBeforeCursor.substring(lastAtIdx + 1);
    if (/\s/.test(textBetween)) {
      setMentionQuery(null);
      return;
    }

    // Walk back past any consecutive @ characters (e.g. "@@") to find the
    // true trigger position, then check if *that* is at start or after whitespace.
    let triggerIdx = lastAtIdx;
    while (triggerIdx > 0 && textBeforeCursor.charAt(triggerIdx - 1) === '@') {
      triggerIdx--;
    }

    // The first @ in the run must be at start of string or preceded by whitespace
    if (triggerIdx > 0 && !/\s/.test(textBeforeCursor.charAt(triggerIdx - 1))) {
      setMentionQuery(null);
      return;
    }

    setMentionQuery(textBetween);
  }, []);

  const handleSelectMention = useCallback(
    (alias: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const selStart = textarea.selectionStart ?? content.length;
      const textBeforeCursor = content.substring(0, selStart);
      const lastAtIdx = textBeforeCursor.lastIndexOf("@");

      if (lastAtIdx !== -1) {
        // Walk back past any consecutive @ characters (e.g. "@@") so we
        // consume all of them and insert a single clean @alias.
        let atStart = lastAtIdx;
        while (atStart > 0 && textBeforeCursor.charAt(atStart - 1) === '@') {
          atStart--;
        }

        const textAfterCursor = content.substring(selStart);
        const newContent =
          content.substring(0, atStart) + `@${alias} ` + textAfterCursor;
        setContent(newContent);
        setMentionQuery(null);

        const newCursorPos = atStart + alias.length + 2;
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 10);
      }
    },
    [textareaRef, content, setContent],
  );

  const handleMentionKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (mentionQuery !== null && mentionRef.current) {
        const handled = mentionRef.current.handleKeyDown(e);
        if (handled) {
          e.preventDefault();
        }
      }
    },
    [mentionQuery],
  );

  const resetMention = useCallback(() => {
    setMentionQuery(null);
  }, []);

  return {
    mentionQuery,
    mentionRef,
    checkMention,
    handleSelectMention,
    handleMentionKeyDown,
    resetMention,
  };
}
