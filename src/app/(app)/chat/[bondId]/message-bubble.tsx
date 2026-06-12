"use client";

/**
 * MessageBubble — a single chat message with the full table-stakes UX:
 * read-receipt ticks, emoji reactions, reply quotes, and large animated
 * rendering for emoji-only messages.
 *
 * Interactions:
 * - Desktop: hovering reveals a small action row (react / reply).
 * - Mobile: long-press opens the reaction bar, swipe right starts a reply.
 */

import React, { useRef, useState, useCallback } from 'react';
import { Check, CheckCheck, Reply, SmilePlus, Pencil, Trash2, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReactionPicker } from './reaction-picker';
import { QuoteBlock } from './reply-preview';
import { BondAttachment } from './bond-attachment';
import type { MessageReactionSummary } from '@/lib/actions/message-reaction-actions';

export interface ChatMessage {
  id: string;
  senderId: string;
  plaintext: string;
  sentAt: Date;
  isMine: boolean;
  readAt?: Date | null;
  replyToId?: string | null;
  editedAt?: Date | null;
  deletedAt?: Date | null;
  attachmentName?: string;
  attachmentType?: string;
  attachmentSize?: number;
  attachmentFileId?: string;
  attachmentEncryptionMeta?: string;
}

// Strips emoji, modifiers (skin tones, ZWJ, variation selectors, regional
// indicators) and whitespace — if nothing remains, the text is emoji-only.
// Plain digits/letters survive the strip, so "123" is NOT emoji-only.
const EMOJI_STRIP_RE = /\p{Extended_Pictographic}|[\u{1f3fb}-\u{1f3ff}]|[\u{1f1e6}-\u{1f1ff}]|[\u200d\ufe0f\u20e3]|\s/gu;

/**
 * Returns the emoji count (1-3) if the message is emoji-only, otherwise 0.
 */
export function emojiOnlyCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed || trimmed.replace(EMOJI_STRIP_RE, '') !== '') return 0;
  let count: number;
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    count = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed)]
      .filter(s => s.segment.trim() !== '').length;
  } else {
    count = Array.from(trimmed.replace(/\s/g, '')).length;
  }
  return count >= 1 && count <= 3 ? count : 0;
}

const LONG_PRESS_MS = 450;
const SWIPE_REPLY_PX = 60;

interface MessageBubbleProps {
  msg: ChatMessage;
  isSearchMatch: boolean;
  reactions: MessageReactionSummary[];
  /** Resolved client-side from the loaded message list; null when not a reply */
  replyPreview: { senderName: string; text: string } | null;
  /** Whether to render read ticks (own messages, peer hasn't disabled receipts) */
  showReadTicks: boolean;
  /** Bond shared secret — needed to decrypt attachments */
  sharedSecret: CryptoKey | null;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onReply: (msg: ChatMessage) => void;
  onEdit: (msg: ChatMessage) => void;
  onDelete: (msg: ChatMessage) => void;
  onQuoteClick: (messageId: string) => void;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
}

export function MessageBubble({
  msg,
  isSearchMatch,
  reactions,
  replyPreview,
  showReadTicks,
  sharedSecret,
  onToggleReaction,
  onReply,
  onEdit,
  onDelete,
  onQuoteClick,
  registerRef,
}: MessageBubbleProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchRef = useRef<{ x: number; y: number; longPressTimer: ReturnType<typeof setTimeout> | null; swiping: boolean }>({
    x: 0, y: 0, longPressTimer: null, swiping: false,
  });

  // Local optimistic ids can't receive reactions/replies yet
  const isPersisted = !msg.id.startsWith('local-') && !msg.id.startsWith('ws-');
  const isDeleted = !!msg.deletedAt;
  const bigEmojiCount = isDeleted ? 0 : emojiOnlyCount(msg.plaintext);
  const isBigEmoji = bigEmojiCount > 0 && !msg.attachmentFileId;

  const clearLongPress = useCallback(() => {
    if (touchRef.current.longPressTimer) {
      clearTimeout(touchRef.current.longPressTimer);
      touchRef.current.longPressTimer = null;
    }
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isPersisted) return;
    const t = e.touches[0];
    touchRef.current.x = t.clientX;
    touchRef.current.y = t.clientY;
    touchRef.current.swiping = false;
    touchRef.current.longPressTimer = setTimeout(() => {
      touchRef.current.longPressTimer = null;
      setPickerOpen(true);
    }, LONG_PRESS_MS);
  }, [isPersisted]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearLongPress();
    // Swipe right → reply gesture (suppress on vertical scroll)
    if (dx > 10 && Math.abs(dy) < 40) {
      touchRef.current.swiping = true;
      setSwipeOffset(Math.min(dx, SWIPE_REPLY_PX + 20));
    }
  }, [clearLongPress]);

  const handleTouchEnd = useCallback(() => {
    clearLongPress();
    if (touchRef.current.swiping && swipeOffset >= SWIPE_REPLY_PX && isPersisted) {
      onReply(msg);
    }
    touchRef.current.swiping = false;
    setSwipeOffset(0);
  }, [clearLongPress, swipeOffset, isPersisted, onReply, msg]);

  // Deleted messages render a plain, non-interactive tombstone.
  if (isDeleted) {
    return (
      <div
        ref={(el) => registerRef(msg.id, el)}
        className={cn('flex', msg.isMine ? 'justify-end' : 'justify-start')}
      >
        <div className="max-w-[75%] rounded-2xl px-4 py-2.5 bg-muted/40 border border-dashed border-muted-foreground/30">
          <p className="text-sm italic text-muted-foreground flex items-center gap-1.5">
            <Ban className="h-3.5 w-3.5" /> This message was deleted
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={(el) => registerRef(msg.id, el)}
      className={cn('group flex items-center gap-1', msg.isMine ? 'justify-end' : 'justify-start')}
    >
      {/* Hover actions (left side for own messages) */}
      {msg.isMine && isPersisted && (
        <HoverActions
          isMine
          onReact={() => setPickerOpen(true)}
          onReply={() => onReply(msg)}
          onEdit={() => onEdit(msg)}
          onDelete={() => onDelete(msg)}
        />
      )}

      <ReactionPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(emoji) => onToggleReaction(msg.id, emoji)}
        align={msg.isMine ? 'end' : 'start'}
      >
        <div
          className="max-w-[75%] transition-transform"
          style={swipeOffset ? { transform: `translateX(${swipeOffset}px)` } : undefined}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={() => { clearLongPress(); setSwipeOffset(0); }}
        >
          {isBigEmoji ? (
            /* Emoji-only message: large, animated, no bubble */
            <div className={cn('px-1', isSearchMatch && 'ring-2 ring-amber-400 ring-offset-2 rounded-lg')}>
              <p className={cn(
                'animate-in zoom-in-50 duration-300 leading-tight',
                bigEmojiCount === 1 ? 'text-5xl' : bigEmojiCount === 2 ? 'text-4xl' : 'text-3xl',
              )}>
                {msg.plaintext}
              </p>
              <MessageMeta msg={msg} showReadTicks={showReadTicks} muted />
            </div>
          ) : (
            <div
              className={cn(
                'rounded-2xl px-4 py-2.5 transition-all',
                msg.isMine
                  ? 'bg-primary text-primary-foreground rounded-br-md'
                  : 'bg-muted rounded-bl-md',
                isSearchMatch && 'ring-2 ring-amber-400 ring-offset-2',
              )}
            >
              {replyPreview && msg.replyToId && (
                <QuoteBlock
                  senderName={replyPreview.senderName}
                  text={replyPreview.text}
                  isMine={msg.isMine}
                  onClick={() => onQuoteClick(msg.replyToId!)}
                />
              )}
              {msg.attachmentFileId && (
                <BondAttachment
                  fileId={msg.attachmentFileId}
                  fileName={msg.attachmentName ?? 'attachment'}
                  fileType={msg.attachmentType}
                  fileSize={msg.attachmentSize}
                  encryptionMeta={msg.attachmentEncryptionMeta}
                  sharedSecret={sharedSecret}
                  isMine={msg.isMine}
                />
              )}
              {/* Suppress the auto "📎 filename" caption when it's just the
                  attachment placeholder; show real user-typed captions. */}
              {!(msg.attachmentFileId && msg.plaintext.startsWith('📎 ')) && (
                <p className="text-sm whitespace-pre-wrap break-words">{msg.plaintext}</p>
              )}
              <MessageMeta msg={msg} showReadTicks={showReadTicks} />
            </div>
          )}

          {/* Reaction pills */}
          {reactions.length > 0 && (
            <div className={cn('flex flex-wrap gap-1 mt-1', msg.isMine ? 'justify-end' : 'justify-start')}>
              {reactions.map((r) => (
                <button
                  key={r.emoji}
                  type="button"
                  onClick={() => onToggleReaction(msg.id, r.emoji)}
                  className={cn(
                    'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs bg-background shadow-sm transition-colors',
                    r.userReacted ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted',
                  )}
                >
                  <span className="text-sm leading-none">{r.emoji}</span>
                  {r.count > 1 && <span className="text-muted-foreground">{r.count}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </ReactionPicker>

      {/* Hover actions (right side for peer messages) */}
      {!msg.isMine && isPersisted && (
        <HoverActions onReact={() => setPickerOpen(true)} onReply={() => onReply(msg)} />
      )}
    </div>
  );
}

function HoverActions({ isMine, onReact, onReply, onEdit, onDelete }: {
  isMine?: boolean;
  onReact: () => void;
  onReply: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  // React/reply are desktop-hover only (mobile uses long-press / swipe).
  // Edit/delete are always shown for your own messages (mobile has no hover),
  // at low opacity on touch and on hover on desktop.
  const btn = 'p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted';
  return (
    <div className="flex items-center gap-0.5 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
      <button type="button" onClick={onReact} className={cn(btn, 'hidden md:inline-flex')} aria-label="Add reaction">
        <SmilePlus className="h-4 w-4" />
      </button>
      <button type="button" onClick={onReply} className={cn(btn, 'hidden md:inline-flex')} aria-label="Reply">
        <Reply className="h-4 w-4" />
      </button>
      {isMine && onEdit && (
        <button type="button" onClick={onEdit} className={btn} aria-label="Edit message">
          <Pencil className="h-4 w-4" />
        </button>
      )}
      {isMine && onDelete && (
        <button type="button" onClick={onDelete} className={cn(btn, 'hover:text-destructive')} aria-label="Delete message">
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function MessageMeta({ msg, showReadTicks, muted }: { msg: ChatMessage; showReadTicks: boolean; muted?: boolean }) {
  return (
    <p className={cn(
      'text-xs mt-1 flex items-center gap-1',
      msg.isMine && !muted ? 'text-primary-foreground/60 justify-end' : 'text-muted-foreground',
      msg.isMine && muted && 'justify-end',
    )}>
      {msg.sentAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      {msg.editedAt && <span className="opacity-70">(edited)</span>}
      {msg.isMine && showReadTicks && (
        msg.readAt ? (
          <CheckCheck className="h-3.5 w-3.5 text-sky-400" aria-label="Read" />
        ) : (
          <Check className="h-3.5 w-3.5 opacity-70" aria-label="Sent" />
        )
      )}
    </p>
  );
}
