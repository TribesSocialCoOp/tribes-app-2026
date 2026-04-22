"use client";

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ShieldAlert, UsersRound, ListChecks, BarChart2, Settings } from "lucide-react";
import { useTribeDetail } from './tribe-detail-context';

export function TribeAdminDashboard() {
  const { state, tribeId, isTribeAdmin } = useTribeDetail();
  const { tribe, members, reportedPosts } = state;

  if (!isTribeAdmin || !tribe) return null;

  return (
    <Card className="shadow-xl border-primary/30">
      <CardHeader className="p-4">
        <div className="flex items-center space-x-3">
          <ShieldAlert className="h-7 w-7 text-primary" />
          <div>
            <CardTitle className="text-xl font-semibold tracking-normal text-primary">Tribe Admin Dashboard</CardTitle>
            <CardDescription className="text-sm">
              Quick stats and admin tools for <span className="font-medium">{tribe.name}</span>.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground font-medium">TOTAL MEMBERS</p>
            <p className="text-2xl font-bold text-foreground">{members.length}</p>
          </Card>
          <Card className="bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground font-medium">PENDING REPORTS</p>
            <p className="text-2xl font-bold text-destructive">{reportedPosts.length}</p>
          </Card>
        </div>
        <Separator />
        <div className="flex flex-wrap gap-3">
          <Link href={`/tribes/${tribeId}/manage-members`} passHref className="flex-1">
            <Button variant="outline" className="w-full"><UsersRound className="mr-2 h-4 w-4" /> Manage Members</Button>
          </Link>
          <Link href={`/tribes/${tribeId}/mod-queue`} passHref className="flex-1">
            <Button variant="outline" className="w-full"><ListChecks className="mr-2 h-4 w-4" /> Moderation Queue</Button>
          </Link>
          <Link href={`/tribes/${tribeId}/analytics`} passHref className="flex-1">
            <Button variant="outline" className="w-full"><BarChart2 className="mr-2 h-4 w-4" /> Engagement Analytics</Button>
          </Link>
          <Link href={`/tribes/${tribeId}/settings`} passHref className="flex-1">
            <Button variant="outline" className="w-full"><Settings className="mr-2 h-4 w-4" /> Tribe Settings</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
