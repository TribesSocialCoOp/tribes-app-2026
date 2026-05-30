"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bell, HeartHandshake, MessageSquareText, Users, ChevronRight, Loader2, FileText, MessageCircle, CheckCheck } from "lucide-react";
import { format } from 'date-fns';
import { useIntercom } from './intercom-context';
import { RecentChats } from '@/components/circles/recent-chats';

interface ActivityItemCardProps {
  item: any;
  icon: React.ReactNode;
  badgeSlot?: React.ReactNode;
  onRead: (itemId: string) => void;
}

const ActivityItemCard: React.FC<ActivityItemCardProps> = ({ item, icon, badgeSlot, onRead }) => {
  const router = useRouter();

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
    if (item.type === 'new_comment' || item.type === 'new_tribe_post') {
      sessionStorage.setItem('post-detail-origin', 'activity');
    }
    
    router.push(url);
  };

  return (
    <div onClick={handleClick} className="cursor-pointer">
      <Card className={`transition-colors ${
        item.read
          ? 'opacity-60 hover:opacity-80 hover:bg-accent/30'
          : 'hover:bg-accent/50 border-l-2 border-l-primary'
      }`}>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full flex items-center justify-center shrink-0 relative">
              {icon}
              {!item.read && (
                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 bg-primary rounded-full border-2 border-background" />
              )}
            </div>
            <div>
              <p className={`text-sm ${item.read ? 'font-normal' : 'font-semibold'}`}>{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {badgeSlot || (
              <span className="text-xs text-muted-foreground">
                {format(item.timestamp, 'MMM d')}
              </span>
            )}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export function IntercomActivityTab() {
  const { state, activityCount, markAllRead, markItemRead } = useIntercom();
  const { activityItems, isLoadingActivity } = state;

  if (isLoadingActivity) {
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

  const bondRequests = activityItems.filter((a: any) => a.type === 'bond_request');
  const unreadMessages = activityItems.filter((a: any) => a.type === 'unread_message');
  const tribeJoinRequests = activityItems.filter((a: any) => a.type === 'tribe_join_request');
  const tribePosts = activityItems.filter((a: any) => a.type === 'new_tribe_post');
  const newComments = activityItems.filter((a: any) => a.type === 'new_comment');

  return (
    <>
      {/* Recent Chats — quick access to active conversations */}
      <RecentChats />

      {/* Mark all read header */}
      {activityCount > 0 && (
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-muted-foreground">
            {activityCount} unread
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

      {bondRequests.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center">
            <HeartHandshake className="mr-2 h-5 w-5 text-pink-500" /> Bond Requests
          </h3>
          <div className="space-y-2">
            {bondRequests.map((item: any) => (
              <ActivityItemCard
                key={item.id}
                item={item}
                icon={<div className="h-10 w-10 rounded-full bg-pink-100 flex items-center justify-center"><HeartHandshake className="h-5 w-5 text-pink-500" /></div>}
                onRead={markItemRead}
              />
            ))}
          </div>
        </section>
      )}
      {unreadMessages.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center">
            <MessageSquareText className="mr-2 h-5 w-5 text-blue-500" /> Unread Messages
          </h3>
          <div className="space-y-2">
            {unreadMessages.map((item: any) => (
              <ActivityItemCard
                key={item.id}
                item={item}
                icon={<div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center"><MessageSquareText className="h-5 w-5 text-blue-500" /></div>}
                badgeSlot={<Badge variant="secondary" className="text-xs">New</Badge>}
                onRead={markItemRead}
              />
            ))}
          </div>
        </section>
      )}
      {tribeJoinRequests.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center">
            <Users className="mr-2 h-5 w-5 text-emerald-500" /> Tribe Join Requests
          </h3>
          <div className="space-y-2">
            {tribeJoinRequests.map((item: any) => (
              <ActivityItemCard
                key={item.id}
                item={item}
                icon={<div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center"><Users className="h-5 w-5 text-emerald-500" /></div>}
                onRead={markItemRead}
              />
            ))}
          </div>
        </section>
      )}
      {tribePosts.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center">
            <FileText className="mr-2 h-5 w-5 text-indigo-500" /> New Tribe Posts
          </h3>
          <div className="space-y-2">
            {tribePosts.map((item: any) => (
              <ActivityItemCard
                key={item.id}
                item={item}
                icon={<div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center"><FileText className="h-5 w-5 text-indigo-500" /></div>}
                onRead={markItemRead}
              />
            ))}
          </div>
        </section>
      )}
      {newComments.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center">
            <MessageCircle className="mr-2 h-5 w-5 text-amber-500" /> New Comments
          </h3>
          <div className="space-y-2">
            {newComments.map((item: any) => (
              <ActivityItemCard
                key={item.id}
                item={item}
                icon={<div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center"><MessageCircle className="h-5 w-5 text-amber-500" /></div>}
                onRead={markItemRead}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
