"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface CardFooterButtonProps {
  /** Primary icon to display */
  icon: LucideIcon;
  /** Responsive label — hidden on mobile, visible on sm+ */
  label?: string;
  /** Show loading spinner instead of icon */
  loading?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  /** Extra classes for the button wrapper */
  className?: string;
  /** Extra classes for the icon */
  iconClassName?: string;
  /** Always-visible children (e.g. a count) */
  children?: React.ReactNode;
}

/**
 * Standardized footer action button for post cards.
 * Handles the responsive icon-margin + hidden-label pattern
 * used across TribePostCard, IntercomFeedItem, and PostDetailClient.
 *
 * - With a `label`: icon gets `mr-0 sm:mr-1.5` (icon-only on mobile)
 * - Without a `label` (count-only): icon gets `mr-1 sm:mr-1.5`
 */
export function CardFooterButton({
  icon: Icon,
  label,
  loading = false,
  onClick,
  disabled,
  className,
  iconClassName,
  children,
}: CardFooterButtonProps) {
  const iconMargin = label ? 'mr-0 sm:mr-1.5' : 'mr-1 sm:mr-1.5';

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("text-muted-foreground hover:text-primary", className)}
      onClick={onClick}
      disabled={disabled}
    >
      {loading ? (
        <Loader2 className={cn(iconMargin, "h-4 w-4 animate-spin")} />
      ) : (
        <Icon className={cn(iconMargin, "h-4 w-4", iconClassName)} />
      )}
      {label && <span className="hidden sm:inline">{label}</span>}
      {children}
    </Button>
  );
}
