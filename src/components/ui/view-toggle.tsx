"use client";

import React from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ViewMode = 'grid' | 'list';

const STORAGE_KEY = 'tribes_view_mode';

interface ViewToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}

/**
 * Compact grid/list toggle. Persists to localStorage.
 */
export function ViewToggle({ value, onChange, className }: ViewToggleProps) {
  const toggle = (mode: ViewMode) => {
    onChange(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  };

  return (
    <div className={cn("flex items-center gap-0.5 p-0.5 bg-muted/50 rounded-md", className)}>
      <button
        onClick={() => toggle('grid')}
        className={cn(
          "p-1.5 rounded transition-all",
          value === 'grid'
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
        aria-label="Grid view"
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button
        onClick={() => toggle('list')}
        className={cn(
          "p-1.5 rounded transition-all",
          value === 'list'
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
        aria-label="List view"
      >
        <List className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Load persisted view mode from localStorage */
export function getPersistedViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'grid';
  return (localStorage.getItem(STORAGE_KEY) as ViewMode) || 'grid';
}
