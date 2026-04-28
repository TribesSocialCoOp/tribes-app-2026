"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ShieldAlert, UsersRound, ListChecks, BarChart2, Settings } from "lucide-react";
import { useTribeDetail } from './tribe-detail-context';

export function TribeAdminDashboard() {
  const { state, tribeId, isTribeAdmin } = useTribeDetail();
  const { tribe, members, reportedPosts } = state;
  const [isVisible, setIsVisible] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.getElementById('header-actions-portal'));
  }, []);

  if (!isTribeAdmin || !tribe) return null;

  return (
    <>
      {portalTarget && createPortal(
        <Button 
          variant={isVisible ? "secondary" : "ghost"} 
          size="icon" 
          onClick={() => setIsVisible(!isVisible)}
          title="Toggle Admin Dashboard"
          className="rounded-full"
        >
          <ShieldAlert className="h-5 w-5 text-primary" />
        </Button>,
        portalTarget
      )}

      {isVisible && (
        <Card className="shadow-xl border-primary/30 mb-6">
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
              <Link href={`/t/${tribe.slug}/manage-members`} passHref className="flex-1">
                <Button variant="outline" className="w-full"><UsersRound className="mr-2 h-4 w-4" /> Manage Members</Button>
              </Link>
              <Link href={`/t/${tribe.slug}/mod-queue`} passHref className="flex-1">
                <Button variant="outline" className="w-full"><ListChecks className="mr-2 h-4 w-4" /> Moderation Queue</Button>
              </Link>
              <Link href={`/t/${tribe.slug}/analytics`} passHref className="flex-1">
                <Button variant="outline" className="w-full"><BarChart2 className="mr-2 h-4 w-4" /> Engagement Analytics</Button>
              </Link>
              <Link href={`/t/${tribe.slug}/settings`} passHref className="flex-1">
                <Button variant="outline" className="w-full"><Settings className="mr-2 h-4 w-4" /> Tribe Settings</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
