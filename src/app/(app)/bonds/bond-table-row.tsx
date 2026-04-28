"use client";

import React from 'react';
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { User, Users, Ticket, AtSign, UserCheck, UserCog, Star, MoreVertical, RefreshCw, Share2, ShieldCheck, Settings, Ban, Trash2, Rss, Moon, RotateCcw, MessageSquareText } from "lucide-react";
import { cn, formatDate } from '@/lib/utils';
import type { Bond } from '@/lib/types';
import { getBondTypeDisplay, getBondTypeBadgeStyle, PasskeyStatusIcon, ConnectVibeIcon } from '@/lib/bond-utils';
import { useBonds } from './bonds-context';
import { useRouter } from 'next/navigation';

interface BondTableRowProps {
  bond: Bond;
}

export const BondTableRow: React.FC<BondTableRowProps> = ({ bond }) => {
  const {
    calculateTimeProgress,
    handleRefreshBond, handleRevokeBond, handleToggleInnerCircle,
    handleToggleShowInIntercom, handleBlockBond, handleRequestReconnect, handleRespondToReconnect, dispatch,
  } = useBonds();
  const router = useRouter();

  const canChat = bond.targetType === 'user' && bond.passkeyStatus !== 'expired';

  const timeBasedProgress = calculateTimeProgress(bond);
  const canToggleInnerCircle = bond.targetType === 'user' && bond.keyType === 'standard';
  const canIntroduce = bond.targetType === 'user' && !bond.keyType?.startsWith('event_');
  const isEventBond = bond.keyType === 'event_promo' || bond.keyType === 'event_attendee';
  const isDormant = bond.passkeyStatus === 'dormant';
  const hasReconnectRequest = !!bond.reconnectRequestedBy;
  const isReconnectFromOther = hasReconnectRequest && bond.reconnectRequestedBy !== bond.targetId;
  const hasAliasInfo = bond.pseudonym || (bond.targetType === 'user' && bond.targetPseudonymForMe) || (bond.targetType === 'tribe' && bond.tribeAssignedNickname);

  const getTargetIcon = () => {
    if (isEventBond) return <Ticket className="h-6 w-6 text-muted-foreground" />;
    if (bond.targetType === 'user') return <User className="h-6 w-6 text-muted-foreground" />;
    return <Users className="h-6 w-6 text-muted-foreground" />;
  };

  const handleRowClick = () => {
    if (canChat) {
      router.push(`/bonds/${bond.id}`);
    }
  };

  return (
    <TableRow
      className={cn(
        "hover:bg-muted/50",
        isEventBond && "bg-purple-500/5 hover:bg-purple-500/10",
        canChat && "cursor-pointer",
      )}
      onClick={handleRowClick}
    >
      <TableCell className="font-medium">
        <div className="flex items-start space-x-2">
          <span className="hidden sm:inline-flex shrink-0 items-center justify-center w-6 h-6 pt-0.5">
            {getTargetIcon()}
          </span>
          <div className="flex-grow min-w-0">
            <span className="block">{bond.targetName}</span>
            <div className={cn("sm:hidden mt-1", hasAliasInfo && "mb-2")}>
              <Badge variant="outline" style={getBondTypeBadgeStyle(bond)} className="whitespace-nowrap">
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
          {canChat && (
            <span className="hidden sm:inline-flex shrink-0 items-center justify-center w-8 h-8 rounded-full hover:bg-primary/10 transition-colors" title="Open chat">
              <MessageSquareText className="h-4 w-4 text-primary" />
            </span>
          )}
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
        <Badge variant="outline" style={getBondTypeBadgeStyle(bond)} className="whitespace-nowrap">
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
        {isDormant ? (
          <span className="text-muted-foreground italic">Dormant{bond.dormantAt ? ` since ${formatDate(bond.dormantAt)}` : ''}</span>
        ) : bond.passkeyStatus === 'expired' ? (
          `Expired: ${formatDate(bond.expiresAt)}`
        ) : (
          `Expires: ${formatDate(bond.expiresAt)}`
        )}
      </TableCell>
      <TableCell className="hidden sm:table-cell" onClick={e => e.stopPropagation()}>
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
      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canChat && (
              <DropdownMenuItem onClick={() => router.push(`/bonds/${bond.id}`)}>
                <MessageSquareText className="mr-2 h-4 w-4 text-primary" /> Chat
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => handleRefreshBond(bond.id)}
              disabled={(bond.passkeyStatus === 'active' && timeBasedProgress > 90 && bond.keyType === 'standard') || isDormant}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </DropdownMenuItem>
            {isDormant && !hasReconnectRequest && (
              <DropdownMenuItem onClick={() => handleRequestReconnect(bond.id)}>
                <RotateCcw className="mr-2 h-4 w-4 text-sky-500" /> Request Reconnect
              </DropdownMenuItem>
            )}
            {isDormant && hasReconnectRequest && isReconnectFromOther && (
              <>
                <DropdownMenuItem onClick={() => handleRespondToReconnect(bond.id, true)}>
                  <RotateCcw className="mr-2 h-4 w-4 text-green-500" /> Approve Reconnect
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleRespondToReconnect(bond.id, false)}>
                  <Ban className="mr-2 h-4 w-4 text-red-500" /> Decline Reconnect
                </DropdownMenuItem>
              </>
            )}
            {isDormant && hasReconnectRequest && !isReconnectFromOther && (
              <DropdownMenuItem disabled>
                <Moon className="mr-2 h-4 w-4" /> Reconnect Pending...
              </DropdownMenuItem>
            )}
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
            {canToggleInnerCircle && (
              <DropdownMenuItem onClick={() => handleToggleInnerCircle(bond.id)}>
                <ShieldCheck className={cn("mr-2 h-4 w-4", bond.innerCircle ? "text-emerald-500" : "text-muted-foreground")} />
                {bond.innerCircle ? 'Remove from Inner Circle' : 'Add to Inner Circle'}
              </DropdownMenuItem>
            )}
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
