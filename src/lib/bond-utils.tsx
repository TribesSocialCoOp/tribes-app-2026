/**
 * @fileoverview Shared bond display utilities.
 * 
 * Extracted from bonds/page.tsx and bond-settings-dialog.tsx to
 * eliminate duplication of bond type display names, badge classes,
 * and passkey status components.
 */

import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, Heart, Meh, Smile, SmilePlus, Ghost as GhostIcon, PartyPopper } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Bond } from '@/lib/types';

/**
 * Get a human-readable display name for a bond type.
 * Handles both regular bond types and event-based key types.
 */
export function getBondTypeDisplay(bond: Bond): string {
  if (bond.keyType === "event_promo" || bond.keyType === "event_attendee") {
    return "Event";
  }
  switch (bond.bondType) {
    case "family": return "Family";
    case "friend": return "Friend";
    case "professional": return "Professional";
    case "collaborator": return "Collaborator";
    case "follower": return "Follower";
    case "supporter": return "Supporter";
    default:
      const exhaustiveCheck: never = bond.bondType;
      return exhaustiveCheck;
  }
}

/**
 * Get badge CSS classes for a bond type.
 */
export function getBondTypeBadgeClasses(bond: Bond): string {
  if (bond.keyType === "event_promo" || bond.keyType === "event_attendee") {
    return "border-transparent bg-purple-500 text-white hover:bg-purple-600";
  }
  switch (bond.bondType) {
    case "family": return "border-transparent bg-pink-500 text-white hover:bg-pink-600";
    case "friend": return "border-transparent bg-orange-500 text-white hover:bg-orange-600";
    case "professional": return "border-transparent bg-sky-600 text-white hover:bg-sky-700";
    case "collaborator": return "border-transparent bg-indigo-500 text-white hover:bg-indigo-600";
    case "follower": return "border-transparent bg-teal-500 text-white hover:bg-teal-600";
    case "supporter": return "border-transparent bg-emerald-500 text-white hover:bg-emerald-600";
    default:
      const _exhaustiveCheck: never = bond.bondType;
      return "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80";
  }
}

/**
 * Passkey status indicator with tooltip.
 */
export const PasskeyStatusIcon: React.FC<{ status: Bond["passkeyStatus"] }> = ({ status }) => {
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

/**
 * Connect vibe icon for the bonds table.
 * Shows a mood-based icon reflecting the bond's emotional connection.
 */
export const ConnectVibeIcon: React.FC<{ bond: Bond }> = ({ bond }) => {
  let iconElement: React.ReactNode;
  let tooltipText: string;

  if (bond.passkeyStatus === "expired") {
    iconElement = <GhostIcon className="h-6 w-6 text-muted-foreground" />;
    tooltipText = (bond.keyType === "event_promo" || bond.keyType === "event_attendee") ? "Event Pass Expired" : "Bond Expired";
  } else if (bond.keyType === "event_promo" || bond.keyType === "event_attendee") {
    let baseText = "Event Pass";
    if (bond.passkeyStatus === 'expires_soon') {
      iconElement = <PartyPopper className="h-6 w-6 text-yellow-500" />;
      baseText += " Expires Soon";
    } else {
      iconElement = <PartyPopper className="h-6 w-6 text-purple-500" />;
      baseText += " Active";
    }
    if (bond.accessTier === 'vip') baseText += " (VIP)";
    tooltipText = baseText;
  } else if (bond.bondType === "family") {
    iconElement = <Heart className="h-6 w-6 text-pink-500 fill-pink-500" />;
    tooltipText = "Family Bond Vibe";
  } else {
    if (bond.reconnectsCount <= 2) {
      iconElement = <Meh className="h-6 w-6 text-muted-foreground" />;
      tooltipText = "Connection active";
    } else if (bond.reconnectsCount <= 6) {
      iconElement = <Smile className="h-6 w-6 text-primary" />;
      tooltipText = "Good connection vibe";
    } else {
      iconElement = <SmilePlus className="h-6 w-6 text-accent" />;
      tooltipText = "Strong connection vibe";
    }
  }

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center justify-center">{iconElement}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
