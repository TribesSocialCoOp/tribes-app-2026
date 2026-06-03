"use client";

import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThreadCollapseHeaderProps {
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
}

export const ThreadCollapseHeader: React.FC<ThreadCollapseHeaderProps> = ({
  count,
  isExpanded,
  onToggle,
}) => {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "flex items-center gap-1.5 py-1.5 px-1 text-xs font-semibold text-muted-foreground/85 hover:text-primary transition-colors w-full text-left select-none border-b border-border/10 mb-2 cursor-pointer touch-target-44"
      )}
    >
      {isExpanded ? (
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
      )}
      <span>{count} {count === 1 ? 'comment' : 'comments'}</span>
    </button>
  );
};
