"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { moodsData } from '@/lib/moods-data';
import { X } from 'lucide-react';

interface MoodTagSelectorProps {
  value: string | null;
  onChange: (moodSlug: string | null) => void;
  allowedMoods?: string[];
}

export function MoodTagSelector({ value, onChange, allowedMoods }: MoodTagSelectorProps) {
  const [open, setOpen] = useState(false);

  const selectedMood = value ? moodsData.find(m => m.slug === value) : null;
  
  // Filter moods if allowedMoods is provided
  const visibleMoods = allowedMoods && allowedMoods.length > 0
    ? moodsData.filter(m => allowedMoods.includes(m.slug))
    : moodsData;

  // If there are no visible moods (e.g. strict filtering leaves 0), don't render the selector
  if (allowedMoods && allowedMoods.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "gap-1 text-xs h-8 font-normal",
            selectedMood ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {selectedMood ? (
            <>
              <span>{selectedMood.emoji}</span>
              <span>{selectedMood.name}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onChange(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    e.preventDefault();
                    onChange(null);
                  }
                }}
                className="ml-0.5 rounded-full hover:bg-muted p-0.5 cursor-pointer inline-flex"
              >
                <X className="h-3 w-3" />
              </span>
            </>
          ) : (
            <span>+ Mood</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <p className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">
          How are you feeling?
        </p>
        <div className="grid grid-cols-3 gap-1">
          {visibleMoods.map(mood => (
            <button
              key={mood.slug}
              onClick={() => {
                onChange(mood.slug);
                setOpen(false);
              }}
              className={cn(
                "flex flex-col items-center gap-0.5 px-2 py-2 rounded-md text-center transition-colors",
                value === mood.slug
                  ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                  : "hover:bg-muted/50 text-foreground"
              )}
            >
              <span className="text-lg">{mood.emoji}</span>
              <span className="text-[10px] font-medium leading-tight">{mood.name}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
