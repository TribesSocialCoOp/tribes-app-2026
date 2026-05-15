"use client";

import React from 'react';
import { Gem, Megaphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface RoleBadgeProps {
  role: 'founder' | 'speaker' | 'member';
  tribeName?: string;
  className?: string;
  showLabel?: boolean;
}

export function RoleBadge({ role, tribeName, className, showLabel = true }: RoleBadgeProps) {
  if (role === 'member') return null;

  const config = {
    founder: {
      icon: Gem,
      label: 'Founder',
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20',
      tooltip: tribeName ? `Founder of ${tribeName}` : 'Tribe Founder',
    },
    speaker: {
      icon: Megaphone,
      label: 'Speaker',
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/20',
      tooltip: tribeName ? `Speaker (Moderator) of ${tribeName}` : 'Tribe Speaker',
    }
  };

  const { icon: Icon, label, color, bgColor, borderColor, tooltip } = config[role];

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border cursor-pointer transition-all",
            bgColor,
            borderColor,
            color,
            className
          )}>
            <Icon className={cn("h-3 w-3 shrink-0", color)} />
            <span className={cn(
              "transition-all duration-200",
              !showLabel && "hidden",
              showLabel && "hidden sm:inline-block"
            )}>
              {label}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
