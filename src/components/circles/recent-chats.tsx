'use client';

/**
 * Recent chats preview strip for the Circles page.
 * Shows a horizontal scrollable row of active conversations.
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { MessageSquareText, Lock } from 'lucide-react';
import { UserAvatar } from '@/components/ui/user-avatar';
import { cn } from '@/lib/utils';
import { useTimeSince } from '@/hooks/use-time-since';

interface Conversation {
  bondId: string;
  targetName: string;
  targetInitials: string;
  lastMessage: string;
  lastMessageAt: Date;
  isEncrypted: boolean;
}

function ChatCard({ convo }: { convo: Conversation }) {
  const timeAgo = useTimeSince(convo.lastMessageAt);

  return (
    <Link
      href={`/bonds/${convo.bondId}`}
      className={cn(
        "flex flex-col items-center gap-1.5 p-3 rounded-xl min-w-[90px] max-w-[100px]",
        "bg-card border border-border/50 hover:border-primary/30",
        "hover:bg-accent/5 transition-all duration-200",
        "hover:shadow-md hover:-translate-y-0.5",
      )}
    >
      <UserAvatar 
        user={{ name: convo.targetName }} 
        className="h-10 w-10 ring-2 ring-primary/20" 
        fallback={convo.targetInitials}
      />
      <span className="text-xs font-medium text-foreground truncate w-full text-center">
        {convo.targetName.split(' ')[0]}
      </span>
      <span className="text-[10px] text-muted-foreground truncate w-full text-center flex items-center justify-center gap-0.5">
        {convo.isEncrypted && <Lock className="h-2.5 w-2.5" />}
        {convo.isEncrypted ? 'Encrypted' : convo.lastMessage.substring(0, 15)}
        {!convo.isEncrypted && convo.lastMessage.length > 15 ? '…' : ''}
      </span>
      <span className="text-[10px] text-muted-foreground/60">{timeAgo}</span>
    </Link>
  );
}

export function RecentChats() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { getRecentConversations } = await import('@/lib/actions/content-actions');
        const result = await getRecentConversations(10);
        setConversations(result);
      } catch (err) {
        console.error('[RecentChats] Failed to load:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Don't render anything if no conversations exist
  if (!loading && conversations.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquareText className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Recent Chats</h3>
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex flex-col items-center gap-1.5 p-3 rounded-xl min-w-[90px] bg-muted/50 animate-pulse">
              <div className="h-10 w-10 rounded-full bg-muted" />
              <div className="h-3 w-12 bg-muted rounded" />
              <div className="h-2 w-16 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-muted">
          {conversations.map(convo => (
            <ChatCard key={convo.bondId} convo={convo} />
          ))}
        </div>
      )}
    </div>
  );
}
