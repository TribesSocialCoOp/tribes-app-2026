/**
 * @fileoverview Shared bond display utilities.
 *
 * Updated for the simplified bond model:
 * - Person bonds show as "Bond" or "Inner Circle"
 * - Tribe bonds show as "Tribe"
 * - Event bonds show as "Event Pass"
 * - Dormant bonds get special treatment
 */

import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Moon, Heart, Meh, Smile, SmilePlus, Ghost as GhostIcon, PartyPopper, ShieldCheck } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Bond } from '@/lib/types';

/**
 * Get a human-readable display name for a bond.
 */
export function getBondTypeDisplay(bond: Bond): string {
  if (bond.keyType === "event_promo" || bond.keyType === "event_attendee") {
    return "Event Pass";
  }
  if (bond.innerCircle && bond.targetType === 'user') {
    return "Inner Circle";
  }
  switch (bond.bondType) {
    case "person": return "Bond";
    case "tribe":  return "Tribe";
    case "event":  return "Event Pass";
    default:       return "Bond";
  }
}

/**
 * Get badge inline styles for a bond.
 *
 * Simplified palette:
 * - Inner Circle: emerald (trust)
 * - Person bond: neutral
 * - Tribe: teal
 * - Event: purple
 * - Dormant: muted
 */
export function getBondTypeBadgeStyle(bond: Bond): React.CSSProperties {
  // Dormant bonds get muted styling
  if (bond.passkeyStatus === 'dormant') {
    return { backgroundColor: '#6b7280', color: '#fff', borderColor: 'transparent', opacity: 0.7 };
  }
  if (bond.keyType === "event_promo" || bond.keyType === "event_attendee" || bond.bondType === 'event') {
    return { backgroundColor: '#a855f7', color: '#fff', borderColor: 'transparent' }; // purple
  }
  if (bond.innerCircle && bond.targetType === 'user') {
    return { backgroundColor: '#10b981', color: '#fff', borderColor: 'transparent' }; // emerald
  }
  if (bond.bondType === 'tribe') {
    return { backgroundColor: '#14b8a6', color: '#fff', borderColor: 'transparent' }; // teal
  }
  // Regular person bond — subtle
  return { backgroundColor: '#6366f1', color: '#fff', borderColor: 'transparent' }; // indigo
}

/**
 * Passkey status indicator with tooltip.
 */
export const PasskeyStatusIcon: React.FC<{ status: Bond["passkeyStatus"] }> = ({ status }) => {
  let icon, tooltipText;

  switch (status) {
    case "active":
      icon = <CheckCircle2 className="h-5 w-5 text-accent" />;
      tooltipText = "Bond is active and secure.";
      break;
    case "fading":
      icon = <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      tooltipText = "Bond is fading — interact to keep it alive.";
      break;
    case "dormant":
      icon = <Moon className="h-5 w-5 text-muted-foreground" />;
      tooltipText = "Bond is dormant — send a reconnect request.";
      break;
    case "expired":
      icon = <XCircle className="h-5 w-5 text-destructive" />;
      tooltipText = "Bond has expired. Re-join the tribe or get a new pass.";
      break;
    default:
      icon = <Moon className="h-5 w-5 text-muted-foreground" />;
      tooltipText = "Unknown status.";
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
 * Calculates the effective connection score by applying time-based decay.
 * Real relationships lose warmth when neglected.
 *
 * Decay Model:
 * - 0–7 days: No decay (grace period)
 * - 8–30 days: ~1 pt/week
 * - 31–90 days: ~2.3 pts/week
 * - 90+ days: ~3.5 pts/week
 */
export function getEffectiveConnectionScore(bond: Bond): number {
  const raw = bond.connectionScore ?? 0;
  if (!bond.lastInteractedAt || raw === 0) return 0;

  const now = Date.now();
  const interacted = new Date(bond.lastInteractedAt).getTime();
  const daysSince = (now - interacted) / 86_400_000;

  if (daysSince <= 0) return raw;

  let decay = 0;
  if (daysSince <= 7) {
    decay = 0;
  } else if (daysSince <= 30) {
    decay = Math.floor(daysSince / 7);
  } else if (daysSince <= 90) {
    decay = Math.floor(daysSince / 3);
  } else {
    decay = Math.floor(daysSince / 2);
  }

  return Math.max(0, raw - decay);
}

/**
 * Connect vibe icon for the bonds table.
 * Shows a mood-based icon reflecting the bond's emotional connection.
 */
export const ConnectVibeIcon: React.FC<{ bond: Bond }> = ({ bond }) => {
  let iconElement: React.ReactNode;
  let tooltipText: string;

  if (bond.passkeyStatus === "dormant") {
    iconElement = <GhostIcon className="h-6 w-6 text-muted-foreground" />;
    tooltipText = "Bond Dormant — Reconnect to restore";
  } else if (bond.passkeyStatus === "expired") {
    iconElement = <GhostIcon className="h-6 w-6 text-muted-foreground" />;
    tooltipText = (bond.keyType === "event_promo" || bond.keyType === "event_attendee") ? "Event Pass Expired" : "Bond Expired";
  } else if (bond.keyType === "event_promo" || bond.keyType === "event_attendee") {
    let baseText = "Event Pass";
    if (bond.passkeyStatus === 'fading') {
      iconElement = <PartyPopper className="h-6 w-6 text-yellow-500" />;
      baseText += " Fading Soon";
    } else {
      iconElement = <PartyPopper className="h-6 w-6 text-purple-500" />;
      baseText += " Active";
    }
    if (bond.accessTier === 'vip') baseText += " (VIP)";
    tooltipText = baseText;
  } else if (bond.innerCircle) {
    iconElement = <Heart className="h-6 w-6 text-emerald-500 fill-emerald-500" />;
    tooltipText = "Inner Circle";
  } else {
    const score = getEffectiveConnectionScore(bond);

    if (score <= 4) {
      iconElement = <Meh className="h-6 w-6 text-muted-foreground" />;
      tooltipText = "New connection";
    } else if (score <= 14) {
      iconElement = <Smile className="h-6 w-6 text-primary" />;
      tooltipText = "Growing connection";
    } else if (score <= 29) {
      iconElement = <SmilePlus className="h-6 w-6 text-accent" />;
      tooltipText = "Good connection vibe";
    } else {
      iconElement = <Heart className="h-6 w-6 text-pink-500 fill-pink-500" />;
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

/**
 * Inner Circle badge — small shield icon for the bonds list.
 */
export const InnerCircleBadge: React.FC<{ show: boolean }> = ({ show }) => {
  if (!show) return null;
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>Inner Circle</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

