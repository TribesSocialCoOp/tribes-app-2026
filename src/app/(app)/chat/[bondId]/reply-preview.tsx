"use client";

/**
 * Reply/quote UI for bond chat.
 *
 * - ComposerReplyBar: shown above the message input while composing a reply.
 * - QuoteBlock: compact quoted-original block rendered inside a sent reply
 *   bubble; tapping it scrolls to the original message.
 *
 * Reply previews are resolved client-side from the already-decrypted
 * message list — the server only ever sees ciphertext, so it can't
 * provide plaintext previews.
 */

import { Reply, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const PREVIEW_MAX_CHARS = 80;

export function truncatePreview(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > PREVIEW_MAX_CHARS ? `${trimmed.slice(0, PREVIEW_MAX_CHARS)}…` : trimmed;
}

interface ComposerReplyBarProps {
  senderName: string;
  text: string;
  onCancel: () => void;
}

export function ComposerReplyBar({ senderName, text, onCancel }: ComposerReplyBarProps) {
  return (
    <div className="flex items-center gap-2 mb-2 p-2 rounded-md bg-muted/50 border-l-2 border-primary">
      <Reply className="h-4 w-4 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-primary">{senderName}</p>
        <p className="text-xs text-muted-foreground truncate">{truncatePreview(text)}</p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="text-muted-foreground hover:text-foreground shrink-0"
        aria-label="Cancel reply"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface QuoteBlockProps {
  senderName: string;
  text: string;
  isMine: boolean;
  onClick?: () => void;
}

export function QuoteBlock({ senderName, text, isMine, onClick }: QuoteBlockProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "block w-full text-left mb-1.5 px-2 py-1 rounded-md border-l-2 cursor-pointer",
        isMine
          ? "bg-primary-foreground/10 border-primary-foreground/40"
          : "bg-background/60 border-primary/50",
      )}
    >
      <p className={cn("text-[11px] font-semibold", isMine ? "text-primary-foreground/80" : "text-primary")}>
        {senderName}
      </p>
      <p className={cn("text-xs truncate", isMine ? "text-primary-foreground/70" : "text-muted-foreground")}>
        {truncatePreview(text)}
      </p>
    </button>
  );
}
