"use client";

import React from 'react';
import { cn } from '@/lib/utils';
import { moodsData } from '@/lib/moods-data';
import { X } from 'lucide-react';
import { PillCarousel } from './pill-carousel';

const STORAGE_KEY = 'tribes_mood_filter';

interface MoodFilterBarProps {
  selectedSlugs: string[];
  onChange: (slugs: string[]) => void;
  className?: string;
}

export function MoodFilterBar({ selectedSlugs, onChange, className }: MoodFilterBarProps) {
  const handleToggle = (slug: string) => {
    const next = selectedSlugs.includes(slug)
      ? selectedSlugs.filter(s => s !== slug)
      : [...selectedSlugs, slug];
    onChange(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const handleClearAll = () => {
    onChange([]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
  };

  return (
    <PillCarousel className={className}>
      {selectedSlugs.length > 0 && (
        <button
          onClick={handleClearAll}
          className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-muted/60 text-muted-foreground hover:bg-muted border border-border transition-colors whitespace-nowrap"
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      )}
      {moodsData.map(mood => {
        const isActive = selectedSlugs.includes(mood.slug);
        return (
          <button
            key={mood.slug}
            onClick={() => handleToggle(mood.slug)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap",
              "transition-all duration-200 border",
              isActive
                ? "bg-accent/20 text-accent-foreground dark:text-accent border-accent/40 shadow-sm"
                : "bg-background text-muted-foreground border-border/60 hover:bg-muted/40 hover:text-foreground"
            )}
          >
            <span className="text-sm">{mood.emoji}</span>
            <span className="hidden sm:inline">{mood.name}</span>
          </button>
        );
      })}
    </PillCarousel>
  );
}

/** Load persisted mood filter from localStorage */
export function getPersistedMoodFilter(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* ignore */ }
  return [];
}
