'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { MessageSquareText, Search, Plus, Lock, Pin, PinOff, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/user-avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useTimeSince } from '@/hooks/use-time-since';

interface Conversation {
  bondId: string;
  targetName: string;
  targetInitials: string;
  lastMessage: string;
  lastMessageAt: Date;
  isEncrypted: boolean;
  unreadCount: number;
}

interface EligibleBond {
  bondId: string;
  targetName: string;
  targetInitials: string;
}

function ConversationRow({
  convo,
  isPinned,
  onTogglePin,
}: {
  convo: Conversation;
  isPinned: boolean;
  onTogglePin: () => void;
}) {
  const timeAgo = useTimeSince(convo.lastMessageAt);

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors group">
      <Link href={`/chat/${convo.bondId}`} className="flex items-center gap-3 flex-1 min-w-0">
        <div className="relative shrink-0">
          <UserAvatar
            user={{ name: convo.targetName }}
            className="h-10 w-10"
            fallback={convo.targetInitials}
          />
          {convo.unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] flex items-center justify-center px-1">
              {convo.unreadCount > 9 ? '9+' : convo.unreadCount}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={cn("font-medium truncate", convo.unreadCount > 0 && "font-semibold")}>
              {convo.targetName}
            </span>
            <span className="text-xs text-muted-foreground shrink-0">{timeAgo}</span>
          </div>
          <p className="text-sm text-muted-foreground truncate flex items-center gap-1">
            {convo.isEncrypted && <Lock className="h-3 w-3 shrink-0" />}
            {convo.lastMessage}
          </p>
        </div>
      </Link>
      <button
        onClick={(e) => { e.preventDefault(); onTogglePin(); }}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-muted"
        title={isPinned ? 'Unpin from sidebar' : 'Pin to sidebar'}
      >
        {isPinned ? (
          <PinOff className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Pin className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}

function NewChatDialog({
  eligibleBonds,
  loading,
}: {
  eligibleBonds: EligibleBond[];
  loading: boolean;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search) return eligibleBonds;
    const q = search.toLowerCase();
    return eligibleBonds.filter(b => b.targetName.toLowerCase().includes(q));
  }, [eligibleBonds, search]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Chat</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start a New Chat</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Search bonds..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="mb-3"
        />
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            {eligibleBonds.length === 0
              ? 'No bonds yet. Create a bond to start chatting.'
              : 'No matching bonds found.'}
          </p>
        ) : (
          <div className="max-h-64 overflow-y-auto space-y-1">
            {filtered.map(bond => (
              <Link
                key={bond.bondId}
                href={`/chat/${bond.bondId}`}
                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <UserAvatar
                  user={{ name: bond.targetName }}
                  className="h-8 w-8"
                  fallback={bond.targetInitials}
                />
                <span className="font-medium text-sm">{bond.targetName}</span>
              </Link>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [eligibleBonds, setEligibleBonds] = useState<EligibleBond[]>([]);
  const [pinnedBondIds, setPinnedBondIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [eligibleLoading, setEligibleLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [{ getRecentConversations }, { getFavorites }] = await Promise.all([
          import('@/lib/actions/content-actions'),
          import('@/lib/actions/favorite-actions'),
        ]);
        const [convos, favs] = await Promise.all([
          getRecentConversations(50),
          getFavorites(),
        ]);
        setConversations(convos);
        setPinnedBondIds(new Set(
          favs.filter(f => f.targetType === 'bond').map(f => f.targetId)
        ));
      } catch (err) {
        console.error('[ChatPage] Failed to load:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    async function loadEligible() {
      try {
        const { getChatEligibleBonds } = await import('@/lib/actions/content-actions');
        const bonds = await getChatEligibleBonds();
        setEligibleBonds(bonds);
      } catch (err) {
        console.error('[ChatPage] Failed to load eligible bonds:', err);
      } finally {
        setEligibleLoading(false);
      }
    }
    loadEligible();
  }, []);

  const filteredConversations = useMemo(() => {
    if (!search) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(c => c.targetName.toLowerCase().includes(q));
  }, [conversations, search]);

  async function togglePin(bondId: string) {
    const isPinned = pinnedBondIds.has(bondId);
    try {
      if (isPinned) {
        const { removeFavoriteByTarget } = await import('@/lib/actions/favorite-actions');
        await removeFavoriteByTarget('bond', bondId);
        setPinnedBondIds(prev => { const next = new Set(prev); next.delete(bondId); return next; });
      } else {
        const { addFavorite } = await import('@/lib/actions/favorite-actions');
        await addFavorite('bond', bondId);
        setPinnedBondIds(prev => new Set(prev).add(bondId));
      }
      window.dispatchEvent(new CustomEvent('favorites-changed'));
    } catch (err) {
      console.error('[ChatPage] Pin toggle failed:', err);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-normal text-foreground font-mono flex items-center gap-3">
            <MessageSquareText className="h-8 w-8 sm:h-10 sm:w-10 text-primary" />
            Chat
          </h1>
          <NewChatDialog eligibleBonds={eligibleBonds} loading={eligibleLoading} />
        </div>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search conversations..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredConversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <MessageSquareText className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">
            {search ? 'No matching conversations' : 'No conversations yet'}
          </h3>
          <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
            {search
              ? 'Try a different search term.'
              : 'Start a new chat with one of your bonds, or create a bond to begin chatting.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {filteredConversations.map(convo => (
            <ConversationRow
              key={convo.bondId}
              convo={convo}
              isPinned={pinnedBondIds.has(convo.bondId)}
              onTogglePin={() => togglePin(convo.bondId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
