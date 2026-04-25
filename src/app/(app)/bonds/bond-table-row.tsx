"use client";

import React from 'react';
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { User, Users, Ticket, AtSign, UserCheck, UserCog, Star, MoreVertical, RefreshCw, Share2, HeartHandshake, Settings, Ban, Trash2, Rss } from "lucide-react";
import { cn, formatDate } from '@/lib/utils';
import type { Bond } from '@/lib/types';
import { getBondTypeDisplay, getBondTypeBadgeClasses, PasskeyStatusIcon, ConnectVibeIcon } from '@/lib/bond-utils';
import { useBonds } from './bonds-context';

interface BondTableRowProps {
  bond: Bond;
}

export const BondTableRow: React.FC<BondTableRowProps> = ({ bond }) => {
  const {
    userRole, maxFamilyBonds, familyBondsCount, calculateTimeProgress,
    handleRefreshBond, handleRevokeBond, handleUpgradeToFamilyBond,
    handleToggleShowInIntercom, handleBlockBond, dispatch,
  } = useBonds();

  const timeBasedProgress = calculateTimeProgress(bond);
  const canUpgradeToFamily = userRole !== "Human_Free" && bond.bondType !== "family" && bond.targetType === "user" && familyBondsCount < maxFamilyBonds && bond.keyType === "standard";
  const canIntroduce = bond.targetType === 'user' && !bond.keyType?.startsWith('event_');
  const isEventBond = bond.keyType === 'event_promo' || bond.keyType === 'event_attendee';
  const hasAliasInfo = bond.pseudonym || (bond.targetType === 'user' && bond.targetPseudonymForMe) || (bond.targetType === 'tribe' && bond.tribeAssignedNickname);

  const getTargetIcon = () => {
    if (isEventBond) return <Ticket className="h-6 w-6 text-muted-foreground" />;
    if (bond.targetType === 'user') return <User className="h-6 w-6 text-muted-foreground" />;
    return <Users className="h-6 w-6 text-muted-foreground" />;
  };

  return (
    <TableRow className={cn("hover:bg-muted/50", isEventBond && "bg-purple-500/5 hover:bg-purple-500/10")}>
      <TableCell className="font-medium">
        <div className="flex items-start space-x-2">
          <span className="hidden sm:inline-flex shrink-0 items-center justify-center w-6 h-6 pt-0.5">
            {getTargetIcon()}
          </span>
          <div className="flex-grow min-w-0">
            <span className="block">{bond.targetName}</span>
            <div className={cn("sm:hidden mt-1", hasAliasInfo && "mb-2")}>
              <Badge variant="outline" className={cn(getBondTypeBadgeClasses(bond), "whitespace-nowrap")}>
                {getBondTypeDisplay(bond)}
              </Badge>
            </div>
            {bond.pseudonym && (
              <div className="text-xs text-muted-foreground flex items-center">
                <AtSign className="h-3 w-3 mr-1 text-primary" /> Your alias: {bond.pseudonym}
              </div>
            )}
            {bond.targetType === 'user' && bond.targetPseudonymForMe && (
              <div className="text-xs text-muted-foreground flex items-center">
                <UserCheck className="h-3 w-3 mr-1 text-sky-600" /> Known as to them: {bond.targetPseudonymForMe}
              </div>
            )}
            {bond.targetType === 'tribe' && bond.tribeAssignedNickname && (
              <div className="text-xs text-muted-foreground flex items-center">
                <UserCog className="h-3 w-3 mr-1 text-orange-500" /> Your tribe nickname: {bond.tribeAssignedNickname}
              </div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <div className="flex flex-col items-start gap-1">
          {bond.keyType === 'event_attendee' && (
            <Badge variant="outline" className="border-orange-500 text-orange-500 bg-orange-500/10 text-xs whitespace-nowrap">Attendee</Badge>
          )}
          {bond.accessTier === 'vip' && (
            <Badge variant="outline" className="border-yellow-400 text-yellow-500 bg-yellow-500/10 text-xs flex items-center whitespace-nowrap">
              <Star className="h-3 w-3 mr-1 fill-current" />VIP
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <Badge variant="outline" className={cn(getBondTypeBadgeClasses(bond), "whitespace-nowrap")}>
          {getBondTypeDisplay(bond)}
        </Badge>
      </TableCell>
      <TableCell className="text-center">
        <PasskeyStatusIcon status={bond.passkeyStatus} />
      </TableCell>
      <TableCell className="hidden md:table-cell text-center">
        <ConnectVibeIcon bond={bond} />
      </TableCell>
      <TableCell className="hidden md:table-cell text-muted-foreground">
        {bond.passkeyStatus === "expired" ? `Expired: ${formatDate(bond.expiresAt)}` : `Expires: ${formatDate(bond.expiresAt)}`}
      </TableCell>
      <TableCell className="hidden sm:table-cell">
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
            <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => handleRefreshBond(bond.id)}
              disabled={bond.passkeyStatus === 'active' && timeBasedProgress > 90 && bond.bondType !== 'family' && bond.keyType === 'standard'}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </DropdownMenuItem>
            <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild>
              <div className={cn(!canIntroduce && "cursor-not-allowed")}>
                <DropdownMenuItem
                  onClick={() => canIntroduce && dispatch({ type: 'OPEN_INTRODUCTION', payload: bond })}
                  disabled={!canIntroduce}
                  className={cn(!canIntroduce && "opacity-50 cursor-not-allowed")}
                >
                  <Share2 className="mr-2 h-4 w-4" /> Introduce To...
                </DropdownMenuItem>
              </div>
            </TooltipTrigger>
            {!canIntroduce && <TooltipContent><p>Introductions are only available for user-to-user bonds, not event passes or tribes.</p></TooltipContent>}
            </Tooltip></TooltipProvider>
            <TooltipProvider><Tooltip><TooltipTrigger asChild>
              <div className={cn(!canUpgradeToFamily && "cursor-not-allowed")}>
                <DropdownMenuItem
                  onClick={() => handleUpgradeToFamilyBond(bond.id)}
                  disabled={!canUpgradeToFamily}
                  className={cn(!canUpgradeToFamily && "opacity-50")}
                >
                  <HeartHandshake className="mr-2 h-4 w-4 text-pink-500" /> Upgrade to Family
                </DropdownMenuItem>
              </div>
            </TooltipTrigger>
            {!canUpgradeToFamily && <TooltipContent><p>Upgrade to an Individual Membership to add more Family Bonds.</p></TooltipContent>}
            </Tooltip></TooltipProvider>
            <DropdownMenuItem onClick={() => dispatch({ type: 'OPEN_SETTINGS', payload: bond })}>
              <Settings className="mr-2 h-4 w-4" /> Bond Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => handleBlockBond(bond.id, bond.targetName)}
              className="text-destructive hover:!bg-destructive/10 hover:!text-destructive"
            >
              <Ban className="mr-2 h-4 w-4" /> Block
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleRevokeBond(bond.id)} className="text-destructive hover:!bg-destructive/10 hover:!text-destructive">
              <Trash2 className="mr-2 h-4 w-4" /> Revoke Bond
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};
