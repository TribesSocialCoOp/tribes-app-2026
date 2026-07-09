"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bell, HeartHandshake, MessageSquareText, Users, ChevronRight, Loader2, FileText, MessageCircle, CheckCheck, AtSign, Landmark } from "lucide-react";
import type { LucideIcon } from 'lucide-react';
import { useActivity } from '@/components/providers/activity-provider';
import { useTimeSince } from '@/hooks/use-time-since';
import { UserAvatar } from '@/components/ui/user-avatar';
import { RecentChats } from '@/components/circles/recent-chats';
import type { ActivityItem } from '@/lib/services/notification-service';

interface SectionConfig {
  type: ActivityItem['type'];
  label: string;
  Icon: LucideIcon;
  iconCls: string;
  circleCls: string;
}

// Action-required sections first. Tailwind classes must be full literals
// (template strings like `bg-${color}-100` get purged by the JIT compiler).
const SECTIONS: readonly SectionConfig[] = [
  { type: 'bond_request', label: 'Bond Requests', Icon: HeartHandshake, iconCls: 'text-pink-500', circleCls: 'bg-pink-100' },
  { type: 'tribe_join_request', label: 'Tribe Join Requests', Icon: Users, iconCls: 'text-emerald-500', circleCls: 'bg-emerald-100' },
  { type: 'unread_message', label: 'Unread Messages', Icon: MessageSquareText, iconCls: 'text-blue-500', circleCls: 'bg-blue-100' },
  { type: 'mention', label: 'Mentions', Icon: AtSign, iconCls: 'text-violet-500', circleCls: 'bg-violet-100' },
  { type: 'new_comment', label: 'New Comments', Icon: MessageCircle, iconCls: 'text-amber-500', circleCls: 'bg-amber-100' },
  { type: 'new_tribe_post', label: 'New Tribe Posts', Icon: FileText, iconCls: 'text-indigo-500', circleCls: 'bg-indigo-100' },
  { type: 'governance', label: 'Governance', Icon: Landmark, iconCls: 'text-teal-500', circleCls: 'bg-teal-100' },
];

interface ActivityItemCardProps {
  item: ActivityItem;
  Icon: LucideIcon;
  iconCls: string;
  circleCls: string;
  onRead: (itemId: string) => void;
}

const ActivityItemCard: React.FC<ActivityItemCardProps> = ({ item, Icon, iconCls, circleCls, onRead }) => {
  const router = useRouter();
  const timeAgo = useTimeSince(item.timestamp);

  const handleClick = async () => {
    // Mark as read FIRST, then navigate — prevents the race condition
    // where page transition resets state before the server call completes
    onRead(item.id);
    // Small delay to let the fire-and-forget server call dispatch
    await new Promise(resolve => setTimeout(resolve, 50));

    const url = item.actionUrl || '/bonds';
    // Use sessionStorage instead of query params — Android adblockers strip ?from= as tracking
    if (item.type === 'tribe_join_request') {
      sessionStorage.setItem('manage-members-origin', 'activity');
    }

    // Next.js router.push() called after `await` (outside a synchronous React event)
    // behaves as replaceState in Next.js 16 / React 19 concurrent mode, clobbering
    // the /activity entry so back() skips past it to wherever you came from.
    // Inject /activity first so back always lands here regardless of push vs. replace.
    History.prototype.pushState.call(window.history, null, '', '/activity');
    router.push(url);
  };

  // Skip the context suffix when the description already names it
  // (e.g. "posted in <tribe>", "wants to form a <bondType> bond")
  const showContext = item.contextName && !item.description.includes(item.contextName);

  return (
    <div
      onClick={handleClick}
      className={`cursor-pointer rounded-lg px-3 py-2.5 transition-colors ${
        item.read
          ? 'opacity-60 hover:opacity-80 hover:bg-accent/30'
          : 'hover:bg-accent/50 border-l-2 border-l-primary'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          {item.actorName ? (
            <>
              <UserAvatar
                user={{ name: item.actorName, avatar: item.actorAvatar }}
                fallback={item.actorAvatarFallback}
                className="h-10 w-10"
              />
              <span className={`absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full flex items-center justify-center ring-1 ring-border ${circleCls}`}>
                <Icon className={`h-3 w-3 ${iconCls}`} />
              </span>
            </>
          ) : (
            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${circleCls}`}>
              <Icon className={`h-5 w-5 ${iconCls}`} />
            </div>
          )}
          {!item.read && (
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 bg-primary rounded-full border-2 border-background" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className={`text-sm truncate ${item.read ? 'font-normal' : 'font-semibold'}`}>{item.title}</p>
            <span className="text-xs text-muted-foreground shrink-0">{timeAgo}</span>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {item.description}
            {showContext ? ` · ${item.contextName}` : ''}
          </p>
          {item.snippet && (
            <p className="text-xs text-muted-foreground/80 line-clamp-2 mt-1">&ldquo;{item.snippet}&rdquo;</p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 self-center" />
      </div>
    </div>
  );
};

interface ActivitySectionProps {
  section: SectionConfig;
  items: ActivityItem[];
  onRead: (itemId: string) => void;
}

function ActivitySection({ section, items, onRead }: ActivitySectionProps) {
  const { label, Icon, iconCls, circleCls } = section;
  const unread = items.filter(i => !i.read).length;

  return (
    <section className="min-w-0 rounded-xl border bg-card">
      <header className="flex items-center gap-2 p-4 pb-2">
        <Icon className={`h-5 w-5 ${iconCls}`} />
        <h3 className="text-base font-semibold text-foreground flex-1 truncate">{label}</h3>
        {unread > 0 && <Badge variant="secondary" className="text-xs">{unread}</Badge>}
      </header>
      <div className="relative">
        {/* Height cap + internal scroll on desktop only; mobile keeps the natural stack */}
        <div className="space-y-1 p-2 pt-0 lg:max-h-96 lg:overflow-y-auto overscroll-contain">
          {items.map(item => (
            <ActivityItemCard
              key={item.id}
              item={item}
              Icon={Icon}
              iconCls={iconCls}
              circleCls={circleCls}
              onRead={onRead}
            />
          ))}
        </div>
        {items.length > 5 && (
          <div className="hidden lg:block pointer-events-none absolute bottom-0 inset-x-0 h-8 rounded-b-xl bg-gradient-to-t from-card to-transparent" />
        )}
      </div>
    </section>
  );
}

export function ActivityList() {
  const { items: activityItems, isLoading, unreadCount, markAllRead, markItemRead } = useActivity();

  if (isLoading && activityItems.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (activityItems.length === 0) {
    return (
      <>
        {/* Recent Chats — quick access to active conversations */}
        <RecentChats />

        <Card className="text-center py-12 shadow-none border border-dashed">
          <CardContent className="p-6">
            <Bell className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">All caught up!</h3>
            <p className="text-muted-foreground text-sm">
              No new activity to show. Check back later for bond requests, messages, and tribe updates.
            </p>
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      {/* Recent Chats — quick access to active conversations */}
      <RecentChats />

      {/* Mark all read header */}
      {unreadCount > 0 && (
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-muted-foreground">
            {unreadCount} unread
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={markAllRead}
            className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </Button>
        </div>
      )}

      {/* Single column on mobile; section panels pack into 2 (lg) / 3 (2xl) columns
          on desktop. `md` is skipped — beside the 16rem sidebar the content area
          is too narrow for two readable columns until lg. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4 lg:gap-6 items-start min-w-0">
        {SECTIONS.map(section => {
          const sectionItems = activityItems.filter(i => i.type === section.type);
          if (sectionItems.length === 0) return null;
          return (
            <ActivitySection
              key={section.type}
              section={section}
              items={sectionItems}
              onRead={markItemRead}
            />
          );
        })}
      </div>
    </>
  );
}
