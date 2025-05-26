
"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link2, RefreshCw, Trash2, ArrowUpCircle, Users, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";

interface Bond {
  id: string;
  targetName: string;
  targetType: "user" | "tribe";
  bondType: "regular" | "hard";
  passkeyStatus: "active" | "expires_soon" | "expired" | "needs_refresh";
  expiresAt?: Date;
  lastRefreshedAt: Date;
  passkeyStrength: number; // 0-100 for progress bar
}

const initialBondsData: Bond[] = [
  { id: "1", targetName: "AI Innovators Tribe", targetType: "tribe", bondType: "hard", passkeyStatus: "active", lastRefreshedAt: new Date(Date.now() - 86400000 * 30), passkeyStrength: 95, expiresAt: new Date(Date.now() + 86400000 * 335) },
  { id: "2", targetName: "Alice Wonderland", targetType: "user", bondType: "regular", passkeyStatus: "expires_soon", expiresAt: new Date(Date.now() + 86400000 * 5), lastRefreshedAt: new Date(Date.now() - 86400000 * 25), passkeyStrength: 20 },
  { id: "3", targetName: "Weekend Hikers", targetType: "tribe", bondType: "regular", passkeyStatus: "active", expiresAt: new Date(Date.now() + 86400000 * 80), lastRefreshedAt: new Date(Date.now() - 86400000 * 10), passkeyStrength: 80 },
  { id: "4", targetName: "Bob The Builder", targetType: "user", bondType: "regular", passkeyStatus: "expired", expiresAt: new Date(Date.now() - 86400000 * 2), lastRefreshedAt: new Date(Date.now() - 86400000 * 62), passkeyStrength: 0 },
  { id: "5", targetName: "Design Masters", targetType: "tribe", bondType: "hard", passkeyStatus: "needs_refresh", lastRefreshedAt: new Date(Date.now() - 86400000 * 180), passkeyStrength: 10, expiresAt: new Date(Date.now() + 86400000 * 185) },
];

const MAX_HARD_BONDS = 5;

export default function BondsPage() {
  const [bonds, setBonds] = useState<Bond[]>(initialBondsData);

  const hardBondsCount = bonds.filter(b => b.bondType === "hard").length;

  const getStatusBadgeVariant = (status: Bond["passkeyStatus"]) => {
    switch (status) {
      case "active": return "default";
      case "expires_soon": return "secondary"; // Using secondary for warning-like
      case "expired": return "destructive";
      case "needs_refresh": return "outline"; // Using outline which can imply an action needed
      default: return "default";
    }
  };

  const getStatusText = (status: Bond["passkeyStatus"]) => {
    switch (status) {
      case "active": return "Active";
      case "expires_soon": return "Expires Soon";
      case "expired": return "Expired";
      case "needs_refresh": return "Needs Refresh";
      default: return "Unknown";
    }
  };

  const formatDate = (date?: Date) => {
    if (!date) return "N/A";
    return date.toLocaleDateString();
  };
  
  const handleRefreshBond = (bondId: string) => {
    // Simulate bond refresh
    setBonds(prevBonds => prevBonds.map(bond => 
      bond.id === bondId ? { ...bond, passkeyStatus: "active", lastRefreshedAt: new Date(), passkeyStrength: 100, expiresAt: bond.bondType === 'regular' ? new Date(Date.now() + 86400000 * 30) : new Date(Date.now() + 86400000 * 365) } : bond
    ));
    // In a real app, call an API to refresh the bond
    console.log(`Refreshing bond ${bondId}`);
  };

  const handleRevokeBond = (bondId: string) => {
    // Simulate bond revocation
    setBonds(prevBonds => prevBonds.filter(bond => bond.id !== bondId));
     // In a real app, call an API to revoke the bond
    console.log(`Revoking bond ${bondId}`);
  };
  
  const handleUpgradeToHardBond = (bondId: string) => {
    if (hardBondsCount >= MAX_HARD_BONDS) {
      alert("Maximum number of hard bonds reached.");
      return;
    }
    setBonds(prevBonds => prevBonds.map(bond => 
      bond.id === bondId ? { ...bond, bondType: "hard", passkeyStatus: "active", lastRefreshedAt: new Date(), passkeyStrength: 100, expiresAt: new Date(Date.now() + 86400000 * 365) } : bond
    ));
    // In a real app, call an API
    console.log(`Upgrading bond ${bondId} to hard bond`);
  };


  return (
    <div className="space-y-8">
      <header className="mb-8">
        <div className="flex items-center space-x-3 mb-2">
            <Link2 className="h-10 w-10 text-primary" />
            <h1 className="text-4xl font-bold tracking-tight text-foreground font-mono">Manage Bonds</h1>
        </div>
        <p className="text-lg text-muted-foreground mt-1">
          Oversee your connections, manage passkey status, and utilize your hard bonds.
        </p>
      </header>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Hard Bond Capacity</CardTitle>
          <CardDescription>
            You have {hardBondsCount} out of {MAX_HARD_BONDS} hard bonds currently active.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={(hardBondsCount / MAX_HARD_BONDS) * 100} className="w-full" />
        </CardContent>
      </Card>

      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle>Current Bonds</CardTitle>
          <CardDescription>A list of your active and expired bonds.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px] hidden sm:table-cell"></TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Passkey Status</TableHead>
                <TableHead className="hidden md:table-cell">Strength</TableHead>
                <TableHead className="hidden lg:table-cell">Expires / Refreshed</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bonds.map((bond) => (
                <TableRow key={bond.id} className="hover:bg-muted/50">
                  <TableCell className="hidden sm:table-cell">
                    {bond.targetType === 'user' ? <User className="h-6 w-6 text-muted-foreground" /> : <Users className="h-6 w-6 text-muted-foreground" />}
                  </TableCell>
                  <TableCell className="font-medium">{bond.targetName}</TableCell>
                  <TableCell>
                    <Badge variant={bond.bondType === "hard" ? "default" : "secondary"}>
                      {bond.bondType === "hard" ? "Hard" : "Regular"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(bond.passkeyStatus)}>
                      {getStatusText(bond.passkeyStatus)}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Progress value={bond.passkeyStrength} className="h-2 w-24" />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">
                    {bond.passkeyStatus === "expired" ? `Expired: ${formatDate(bond.expiresAt)}` : 
                     bond.expiresAt ? `Expires: ${formatDate(bond.expiresAt)}` : `Refreshed: ${formatDate(bond.lastRefreshedAt)}`}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleRefreshBond(bond.id)} disabled={bond.passkeyStatus === 'active' && bond.passkeyStrength > 90}>
                          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
                        </DropdownMenuItem>
                        {bond.bondType === "regular" && hardBondsCount < MAX_HARD_BONDS && (
                          <DropdownMenuItem onClick={() => handleUpgradeToHardBond(bond.id)}>
                            <ArrowUpCircle className="mr-2 h-4 w-4" /> Upgrade to Hard
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
              ))}
              {bonds.length === 0 && (
                <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        You have no active bonds. Start connecting with users or tribes!
                    </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
         <CardFooter>
            <p className="text-xs text-muted-foreground">
                Regular bonds typically require refreshing every 30 days. Hard bonds offer extended validity.
            </p>
        </CardFooter>
      </Card>
    </div>
  );
}

    