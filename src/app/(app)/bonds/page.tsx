
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Link2, RefreshCw, Trash2, Users, User, HeartHandshake, Rss, CheckCircle2, AlertTriangle, XCircle, Info, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from '@/lib/utils';

type BondType = "family" | "friend" | "professional" | "collaborator" | "follower" | "supporter";

interface Bond {
  id: string;
  targetName: string;
  targetType: "user" | "tribe";
  bondType: BondType;
  passkeyStatus: "active" | "expires_soon" | "expired" | "needs_refresh";
  expiresAt: Date;
  lastRefreshedAt: Date;
  reconnectsCount: number;
  showInIntercom?: boolean;
}

const initialBondsData: Bond[] = [
  { id: "1", targetName: "AI Innovators Tribe", targetType: "tribe", bondType: "follower", passkeyStatus: "active", lastRefreshedAt: new Date(Date.now() - 86400000 * 30), expiresAt: new Date(Date.now() + 86400000 * (30)), reconnectsCount: 2, showInIntercom: true },
  { id: "2", targetName: "Alice Wonderland", targetType: "user", bondType: "friend", passkeyStatus: "expires_soon", expiresAt: new Date(Date.now() + 86400000 * 5), lastRefreshedAt: new Date(Date.now() - 86400000 * 25), reconnectsCount: 1, showInIntercom: true },
  { id: "3", targetName: "Weekend Hikers", targetType: "tribe", bondType: "follower", passkeyStatus: "active", expiresAt: new Date(Date.now() + 86400000 * 80), lastRefreshedAt: new Date(Date.now() - 86400000 * 10), reconnectsCount: 0, showInIntercom: false },
  { id: "4", targetName: "Bob The Builder", targetType: "user", bondType: "professional", passkeyStatus: "expired", expiresAt: new Date(Date.now() - 86400000 * 2), lastRefreshedAt: new Date(Date.now() - 86400000 * 62), reconnectsCount: 3, showInIntercom: true },
  { id: "5", targetName: "Mom", targetType: "user", bondType: "family", passkeyStatus: "active", lastRefreshedAt: new Date(Date.now() - 86400000 * 10), expiresAt: new Date(Date.now() + 86400000 * (365-10)), reconnectsCount: 5, showInIntercom: true },
  { id: "6", targetName: "Design Masters", targetType: "tribe", bondType: "professional", passkeyStatus: "needs_refresh", lastRefreshedAt: new Date(Date.now() - 86400000 * 180), expiresAt: new Date(Date.now() + 86400000 * (30)), reconnectsCount: 1, showInIntercom: true },
  { id: "7", targetName: "Project Collab", targetType: "tribe", bondType: "collaborator", passkeyStatus: "active", lastRefreshedAt: new Date(Date.now() - 86400000 * 15), expiresAt: new Date(Date.now() + 86400000 * 15), reconnectsCount: 0, showInIntercom: true },
  { id: "8", targetName: "Art Patronage Inc.", targetType: "tribe", bondType: "supporter", passkeyStatus: "active", lastRefreshedAt: new Date(Date.now() - 86400000 * 15), expiresAt: new Date(Date.now() + 86400000 * (45)), reconnectsCount: 4, showInIntercom: true },
  { id: "9", targetName: "Book Club Collective", targetType: "tribe", bondType: "follower", passkeyStatus: "expires_soon", expiresAt: new Date(Date.now() + 86400000 * 12), lastRefreshedAt: new Date(Date.now() - 86400000 * 18), reconnectsCount: 1, showInIntercom: true },
  { id: "10", targetName: "John Doe (Dev)", targetType: "user", bondType: "collaborator", passkeyStatus: "needs_refresh", lastRefreshedAt: new Date(Date.now() - 86400000 * 90), expiresAt: new Date(Date.now() + 86400000 * (30)), reconnectsCount: 2, showInIntercom: false },
];


const MAX_FAMILY_BONDS = 25;
const MAX_RECONNECTS_FOR_FULL_BAR = 10; // Max reconnections for non-family bar to be 100%

const getBondTypeDisplay = (bondType: BondType): string => {
  switch (bondType) {
    case "family": return "Family";
    case "friend": return "Friend";
    case "professional": return "Professional";
    case "collaborator": return "Collaborator";
    case "follower": return "Follower";
    case "supporter": return "Supporter";
    default:
      const exhaustiveCheck: never = bondType;
      return exhaustiveCheck;
  }
};

const getBondTypeBadgeClasses = (bondType: BondType): string => {
  switch (bondType) {
    case "family": return "border-transparent bg-pink-500 text-white hover:bg-pink-600";
    case "friend": return "border-transparent bg-orange-500 text-white hover:bg-orange-600";
    case "professional": return "border-transparent bg-sky-600 text-white hover:bg-sky-700";
    case "collaborator": return "border-transparent bg-indigo-500 text-white hover:bg-indigo-600";
    case "follower": return "border-transparent bg-teal-500 text-white hover:bg-teal-600";
    case "supporter": return "border-transparent bg-emerald-500 text-white hover:bg-emerald-600";
    default:
      const _exhaustiveCheck: never = bondType;
      return "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80";
  }
};

const PasskeyStatusIcon: React.FC<{ status: Bond["passkeyStatus"] }> = ({ status }) => {
  let icon, tooltipText;

  switch (status) {
    case "active":
      icon = <CheckCircle2 className="h-5 w-5 text-accent" />;
      tooltipText = "Passkey is active and secure.";
      break;
    case "expires_soon":
      icon = <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      tooltipText = "Passkey is expiring soon. Consider refreshing.";
      break;
    case "expired":
      icon = <XCircle className="h-5 w-5 text-destructive" />;
      tooltipText = "Passkey has expired. Please refresh.";
      break;
    case "needs_refresh":
      icon = <Info className="h-5 w-5 text-primary" />;
      tooltipText = "Passkey needs to be refreshed for optimal security.";
      break;
    default:
      icon = <Info className="h-5 w-5 text-muted-foreground" />;
      tooltipText = "Unknown passkey status.";
  }

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center justify-center">{icon}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};


export default function BondsPage() {
  const [bonds, setBonds] = useState<Bond[]>(initialBondsData);

  const familyBondsCount = bonds.filter(b => b.bondType === "family").length;

  const formatDate = (date: Date) => {
    if (!date) return "N/A";
    return date.toLocaleDateString();
  };
  
  const handleRefreshBond = (bondId: string) => {
    setBonds(prevBonds => prevBonds.map(bond => 
      bond.id === bondId ? { 
        ...bond, 
        passkeyStatus: "active", 
        lastRefreshedAt: new Date(), 
        expiresAt: new Date(Date.now() + (bond.bondType === 'family' ? 365 : 30) * 86400000),
        reconnectsCount: (bond.reconnectsCount || 0) + 1,
      } : bond
    ));
  };

  const handleRevokeBond = (bondId: string) => {
    setBonds(prevBonds => prevBonds.filter(bond => bond.id !== bondId));
  };
  
  const handleUpgradeToFamilyBond = (bondId: string) => {
    if (familyBondsCount >= MAX_FAMILY_BONDS) {
      alert("Maximum number of family bonds reached.");
      return;
    }
    setBonds(prevBonds => prevBonds.map(bond => 
      (bond.id === bondId && bond.targetType === 'user') ? { 
        ...bond, 
        bondType: "family", 
        passkeyStatus: "active", 
        lastRefreshedAt: new Date(), 
        expiresAt: new Date(Date.now() + 365 * 86400000),
        reconnectsCount: (bond.reconnectsCount || 0) + 1, 
      } : bond
    ));
  };

  const handleToggleShowInIntercom = (bondId: string, checked: boolean) => {
    setBonds(prevBonds => prevBonds.map(bond =>
      bond.id === bondId ? { ...bond, showInIntercom: checked } : bond
    ));
  };

  // This calculates progress for the "disable refresh button" logic (time-based)
  const calculateTimeProgress = (bond: Bond): number => {
    if (bond.passkeyStatus === 'expired') return 0;
    if (!(bond.expiresAt instanceof Date) || !(bond.lastRefreshedAt instanceof Date) || isNaN(bond.expiresAt.getTime()) || isNaN(bond.lastRefreshedAt.getTime())) {
        return 0; 
    }

    const now = Date.now();
    const expiresAtTime = bond.expiresAt.getTime();
    const lastRefreshedAtTime = bond.lastRefreshedAt.getTime();

    if (expiresAtTime <= now) return 0; 

    const totalPlannedDuration = expiresAtTime - lastRefreshedAtTime;
    
    if (totalPlannedDuration <= 0) {
        return expiresAtTime > now ? 100 : 0;
    }
    
    const timeLeft = expiresAtTime - now;
    const progressPercent = (timeLeft / totalPlannedDuration) * 100;
    
    return Math.max(0, Math.min(100, progressPercent));
  };

  const getReconnectsBarValue = (reconnectsCount: number): number => {
    const percentage = (reconnectsCount / MAX_RECONNECTS_FOR_FULL_BAR) * 100;
    return Math.min(percentage, 100); // Cap at 100%
  };


  return (
    <div className="space-y-8">
      <header className="mb-8">
        <div className="flex items-center space-x-3 mb-2">
            <Link2 className="h-10 w-10 text-primary" />
            <h1 className="text-4xl font-bold tracking-normal text-foreground font-mono">Manage Bonds</h1>
        </div>
        <p className="text-lg text-muted-foreground mt-1">
          Oversee your connections, manage passkey status, and utilize your family bonds.
        </p>
      </header>

      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <HeartHandshake className="h-6 w-6 text-pink-500" />
            <CardTitle className="tracking-normal">Family Bond Capacity</CardTitle>
          </div>
          <CardDescription>
            You have {familyBondsCount} out of {MAX_FAMILY_BONDS} family bonds currently active. Family bonds are for user-to-user connections.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={(familyBondsCount / MAX_FAMILY_BONDS) * 100} className="w-full" />
        </CardContent>
      </Card>

      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="tracking-normal">Current Bonds</CardTitle>
          <CardDescription>A list of your active and expired bonds. Toggle visibility in your Intercom feed.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px] hidden sm:table-cell"></TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-center">Passkey Status</TableHead>
                <TableHead className="hidden md:table-cell">Re-Connects</TableHead>
                <TableHead className="hidden lg:table-cell">Expires</TableHead>
                <TableHead>Intercom Feed</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bonds.map((bond) => {
                const timeBasedProgress = calculateTimeProgress(bond);
                const reconnectsBarValue = getReconnectsBarValue(bond.reconnectsCount);
                return (
                <TableRow key={bond.id} className="hover:bg-muted/50">
                  <TableCell className="hidden sm:table-cell">
                    {bond.targetType === 'user' ? <User className="h-6 w-6 text-muted-foreground" /> : <Users className="h-6 w-6 text-muted-foreground" />}
                  </TableCell>
                  <TableCell className="font-medium">{bond.targetName}</TableCell>
                  <TableCell>
                    <Badge className={cn(getBondTypeBadgeClasses(bond.bondType), "whitespace-nowrap")}>
                      {getBondTypeDisplay(bond.bondType)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <PasskeyStatusIcon status={bond.passkeyStatus} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                     <div className="flex items-center space-x-2">
                        {bond.bondType === 'family' ? (
                            <Progress value={100} className="h-2 w-16 bg-amber-400" />
                        ) : (
                            <>
                                <span className="text-sm font-medium text-muted-foreground w-4 text-right">{bond.reconnectsCount}</span>
                                <Progress value={reconnectsBarValue} className="h-2 w-12" />
                            </>
                        )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">
                    {bond.passkeyStatus === "expired" ? `Expired: ${formatDate(bond.expiresAt)}` : 
                     `Expires: ${formatDate(bond.expiresAt)}`}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id={`intercom-switch-${bond.id}`}
                        checked={!!bond.showInIntercom}
                        onCheckedChange={(checked) => handleToggleShowInIntercom(bond.id, checked)}
                        aria-label="Show in Intercom feed"
                      />
                       <Rss className={`h-4 w-4 ${bond.showInIntercom ? 'text-accent' : 'text-muted-foreground'}`} />
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem 
                            onClick={() => handleRefreshBond(bond.id)} 
                            disabled={bond.bondType !== 'family' && bond.passkeyStatus === 'active' && timeBasedProgress > 90}
                        >
                          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
                        </DropdownMenuItem>
                        {bond.bondType !== "family" && bond.targetType === "user" && familyBondsCount < MAX_FAMILY_BONDS && (
                          <DropdownMenuItem onClick={() => handleUpgradeToFamilyBond(bond.id)}>
                            <HeartHandshake className="mr-2 h-4 w-4 text-pink-500" /> Upgrade to Family
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleRevokeBond(bond.id)} className="text-destructive hover:!bg-destructive/10 hover:!text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" /> Revoke Bond
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )})}
              {bonds.length === 0 && (
                <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        You have no active bonds. Start connecting with users or tribes!
                    </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
         <CardFooter>
            <p className="text-xs text-muted-foreground">
                The "Re-Connects" column displays the number of times a bond has been refreshed, and a bar visualizing this count (up to {MAX_RECONNECTS_FOR_FULL_BAR} for a full bar for non-family bonds). Family bonds are always shown as full and golden. Hover over status icons for details. Use the <Rss className="inline h-3 w-3 text-accent"/> toggle to control which bond updates appear on your Intercom feed.
            </p>
        </CardFooter>
      </Card>
    </div>
  );
}

