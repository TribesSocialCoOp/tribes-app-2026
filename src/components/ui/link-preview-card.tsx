"use client";

import React from 'react';
import { ExternalLink, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LinkPreviewCardProps {
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  className?: string;
  /** Compact mode for compose-time preview */
  compact?: boolean;
  /** Show a dismiss button */
  onDismiss?: () => void;
}

/**
 * Rich link preview card — renders unfurled URL metadata in a beautiful,
 * clickable card. Used in post feeds and compose preview.
 */
export function LinkPreviewCard({
  url,
  title,
  description,
  imageUrl,
  siteName,
  className,
  compact = false,
  onDismiss,
}: LinkPreviewCardProps) {
  // Extract domain for display
  let displayDomain = '';
  try {
    displayDomain = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    displayDomain = url;
  }

  const hasImage = !!imageUrl;
  const hasContent = !!(title || description);

  // If we have literally nothing to show, render a minimal link chip
  if (!hasContent && !hasImage) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors text-sm group",
          className,
        )}
      >
        <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-primary truncate group-hover:underline">{displayDomain}</span>
        <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 ml-auto" />
      </a>
    );
  }

  return (
    <div className={cn("relative group", className)}>
      {onDismiss && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss(); }}
          className="absolute -top-2 -right-2 z-10 bg-background border border-border rounded-full h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shadow-sm"
          aria-label="Dismiss preview"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      )}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
        className={cn(
          "block rounded-lg border overflow-hidden transition-all duration-200",
          "hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5",
          "bg-card",
          compact ? "max-w-full" : "max-w-full",
        )}
      >
        <div className={cn(
          "flex",
          // Horizontal layout when we have an image (on larger screens)
          hasImage && !compact ? "flex-col sm:flex-row" : "flex-col",
        )}>
          {/* OG Image */}
          {hasImage && (
            <div className={cn(
              "relative overflow-hidden bg-muted/20 shrink-0",
              compact
                ? "h-32 w-full"
                : "h-40 w-full sm:h-auto sm:w-48",
            )}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={title || 'Link preview'}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
                onError={(e) => {
                  // Hide the image container if it fails to load
                  (e.target as HTMLElement).parentElement!.style.display = 'none';
                }}
              />
            </div>
          )}

          {/* Text Content */}
          <div className={cn(
            "flex flex-col justify-center min-w-0 p-3",
            compact ? "p-2.5" : "p-3 sm:p-4",
          )}>
            {/* Site name */}
            <div className="flex items-center gap-1.5 mb-1">
              <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide truncate">
                {siteName || displayDomain}
              </span>
            </div>

            {/* Title */}
            {title && (
              <h4 className={cn(
                "font-semibold text-foreground leading-snug",
                compact ? "text-sm line-clamp-1" : "text-sm line-clamp-2",
              )}>
                {title}
              </h4>
            )}

            {/* Description */}
            {description && (
              <p className={cn(
                "text-muted-foreground leading-relaxed mt-1",
                compact ? "text-xs line-clamp-1" : "text-xs line-clamp-2 sm:line-clamp-3",
              )}>
                {description}
              </p>
            )}

            {/* URL */}
            <div className="flex items-center gap-1 mt-1.5">
              <span className="text-[10px] text-muted-foreground/70 truncate max-w-[200px]">
                {displayDomain}
              </span>
              <ExternalLink className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />
            </div>
          </div>
        </div>
      </a>
    </div>
  );
}

/**
 * Loading skeleton for link preview (shown while unfurling).
 */
export function LinkPreviewSkeleton() {
  return (
    <div className="rounded-lg border overflow-hidden bg-card animate-pulse">
      <div className="flex flex-col sm:flex-row">
        <div className="h-32 sm:h-auto sm:w-48 bg-muted/40 shrink-0" />
        <div className="p-3 sm:p-4 flex-1 space-y-2">
          <div className="h-3 bg-muted/40 rounded w-20" />
          <div className="h-4 bg-muted/50 rounded w-3/4" />
          <div className="h-3 bg-muted/30 rounded w-full" />
          <div className="h-3 bg-muted/30 rounded w-2/3" />
        </div>
      </div>
    </div>
  );
}
