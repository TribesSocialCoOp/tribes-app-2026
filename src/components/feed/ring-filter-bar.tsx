"use client";

import React from 'react';
import { cn } from '@/lib/utils';
import type { Ring } from '@/lib/types';
import { BookLock, Heart, Users, Tent, Radio, LayoutGrid } from 'lucide-react';
import { PillCarousel } from './pill-carousel';

type FilterValue = Ring | 'all' | 'streams';

const RING_FILTERS: { value: FilterValue; label: string; emoji: string; icon: React.ElementType }[] = [
  { value: 'all', label: 'All', emoji: '📡', icon: LayoutGrid },
  { value: 'inner_circle', label: 'Inner Circle', emoji: '❤️', icon: Heart },
  { value: 'my_people', label: 'My People', emoji: '🤝', icon: Users },
  { value: 'tribes', label: 'My Tribes', emoji: '👥', icon: Tent },
  { value: 'streams', label: 'Streams', emoji: '🌐', icon: Radio },
  { value: 'journal', label: 'Journal', emoji: '🪞', icon: BookLock },
];

const STORAGE_KEY = 'tribes_ring_filter';

interface RingFilterBarProps {
  value: FilterValue;
  onChange: (ring: FilterValue) => void;
  className?: string;
}

export function RingFilterBar({ value, onChange, className }: RingFilterBarProps) {
  const handleSelect = (ring: FilterValue) => {
    onChange(ring);
    localStorage.setItem(STORAGE_KEY, ring);
  };

  return (
    <PillCarousel className={className}>
      {RING_FILTERS.map(filter => {
        const isActive = value === filter.value;
        return (
          <button
            key={filter.value}
            onClick={() => handleSelect(filter.value)}
            className={cn(
              "flex items-center gap-1 sm:gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-full text-xs font-medium whitespace-nowrap",
              "transition-all duration-200 border",
              isActive
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-background text-muted-foreground border-border hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <span className="text-sm">{filter.emoji}</span>
            <span>{filter.label}</span>
          </button>
        );
      })}
    </PillCarousel>
  );
}

/** Load persisted ring filter from localStorage */
export function getPersistedRingFilter(): FilterValue {
  if (typeof window === 'undefined') return 'all';
  return (localStorage.getItem(STORAGE_KEY) as FilterValue) || 'all';
}
