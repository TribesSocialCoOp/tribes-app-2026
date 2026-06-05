import React, { forwardRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MentionAutocomplete } from '@/components/compose/mention-autocomplete';
import { useMentionAutocomplete } from '@/hooks/use-mention-autocomplete';
import { EmojiAutocomplete } from '@/components/compose/emoji-autocomplete';
import { useEmojiAutocomplete } from '@/hooks/use-emoji-autocomplete';

export interface InlineReplyBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isSending: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  onFocus?: () => void;
  className?: string;
}

export const InlineReplyBox = forwardRef<HTMLDivElement, InlineReplyBoxProps>(
  (
    {
      value,
      onChange,
      onSend,
      isSending,
      placeholder = "Write a reply...",
      autoFocus = true,
      onFocus,
      className,
    },
    ref
  ) => {
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const { mentionQuery, mentionRef, checkMention, handleSelectMention, handleMentionKeyDown } =
      useMentionAutocomplete(textareaRef, value, onChange);
    const { emojiQuery, emojiRef, checkEmoji, handleSelectEmoji, handleEmojiKeyDown } =
      useEmojiAutocomplete(textareaRef, value, onChange);

    return (
      <div ref={ref} className={cn("px-3 sm:px-4 pb-3 sm:pb-4 flex gap-2", className)}>
        <div className="relative flex-1 z-10">
          <Textarea
            ref={textareaRef}
            placeholder={placeholder}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              checkMention(e.target.value, e.target.selectionStart);
              checkEmoji(e.target.value, e.target.selectionStart);
            }}
            onKeyDown={(e) => {
              handleMentionKeyDown(e);
              handleEmojiKeyDown(e);
              if (e.isDefaultPrevented()) return;

              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                if (value.trim() && !isSending) {
                  onSend();
                }
              }
            }}
            onSelect={(e) => {
              const target = e.target as HTMLTextAreaElement;
              checkMention(target.value, target.selectionStart);
              checkEmoji(target.value, target.selectionStart);
            }}
            rows={1}
            className="text-sm min-h-[36px] resize-none w-full"
            autoFocus={autoFocus}
            onFocus={onFocus}
          />
          <MentionAutocomplete
            ref={mentionRef}
            query={mentionQuery}
            onSelect={handleSelectMention}
          />
          <EmojiAutocomplete
            ref={emojiRef}
            query={emojiQuery}
            onSelect={handleSelectEmoji}
          />
        </div>
        <Button
          size="icon"
          variant="ghost"
          disabled={!value.trim() || isSending}
          onClick={onSend}
          className="shrink-0"
        >
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    );
  }
);

InlineReplyBox.displayName = 'InlineReplyBox';
