"use client";

import React from 'react';
import Link from 'next/link';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from '@/components/ui/badge';
import { Bell, HeartHandshake, MessageSquareText, Users, ChevronRight, Loader2 } from "lucide-react";
import { format } from 'date-fns';
import { useIntercom } from './intercom-context';

interface ActivityItemCardProps {
  item: any;
  icon: React.ReactNode;
  badgeSlot?: React.ReactNode;
}

const ActivityItemCard: React.FC<ActivityItemCardProps> = ({ item, icon, badgeSlot }) => (
  <Link href={item.actionUrl || '/bonds'}>
    <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div>
            <p className="text-sm font-medium">{item.title}</p>
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
  </Link>
);

export function IntercomActivityTab() {
  const { state } = useIntercom();
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
      <Card className="text-center py-12 shadow-none border border-dashed">
        <CardContent className="p-6">
          <Bell className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">All caught up!</h3>
          <p className="text-muted-foreground text-sm">
            No new activity to show. Check back later for bond requests, messages, and tribe updates.
          </p>
        </CardContent>
      </Card>
    );
  }

  const bondRequests = activityItems.filter((a: any) => a.type === 'bond_request');
  const unreadMessages = activityItems.filter((a: any) => a.type === 'unread_message');
  const tribeJoinRequests = activityItems.filter((a: any) => a.type === 'tribe_join_request');

  return (
    <>
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
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
