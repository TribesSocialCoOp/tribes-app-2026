"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Ring } from '@/lib/types';
import { BookLock, Heart, Users, Tent, ChevronDown, Loader2 } from 'lucide-react';
import { getMyTribesList } from '@/lib/actions/content-actions';

const RING_OPTIONS: { value: Ring; label: string; emoji: string; icon: React.ElementType; description: string }[] = [
  { value: 'journal', label: 'Journal', emoji: '🪞', icon: BookLock, description: 'Private — only you can see this' },
  { value: 'inner_circle', label: 'Inner Circle', emoji: '❤️', icon: Heart, description: 'Your closest bonds' },
  { value: 'my_people', label: 'My People', emoji: '🤝', icon: Users, description: 'All your active bonds' },
  { value: 'tribes', label: 'My Tribes', emoji: '👥', icon: Tent, description: 'Select tribe(s) to post to' },
];

const STORAGE_KEY = 'tribes_last_ring';

interface RingSelectorProps {
  value: Ring;
  onChange: (ring: Ring) => void;
  selectedTribeIds: string[];
  onTribeIdsChange: (ids: string[]) => void;
  onTribesLoaded?: (tribes: any[]) => void;
  defaultRing?: Ring;
  defaultTribeId?: string;
}

export function RingSelector({
  value,
  onChange,
  selectedTribeIds,
  onTribeIdsChange,
  onTribesLoaded,
  defaultTribeId,
}: RingSelectorProps) {
  const [tribes, setTribes] = useState<{ id: string; name: string }[]>([]);
  const [loadingTribes, setLoadingTribes] = useState(false);
  const [open, setOpen] = useState(false);

  // Load user's tribes when "My Tribes" is selected
  useEffect(() => {
    if (value === 'tribes' && tribes.length === 0) {
      setLoadingTribes(true);
      getMyTribesList().then(t => {
        setTribes(t);
        onTribesLoaded?.(t);
        // Auto-select default tribe or first tribe if none selected
        if (t.length > 0 && selectedTribeIds.length === 0) {
          const defaultId = defaultTribeId && t.find(tr => tr.id === defaultTribeId)
            ? defaultTribeId
            : t[0]!.id;
          onTribeIdsChange([defaultId]);
        }
      }).finally(() => setLoadingTribes(false));
    }
  }, [value]);

  const handleRingSelect = (ring: Ring) => {
    onChange(ring);
    localStorage.setItem(STORAGE_KEY, ring);
    if (ring !== 'tribes') {
      setOpen(false);
    }
  };

  const handleTribeToggle = (tribeId: string, checked: boolean) => {
    if (checked) {
      onTribeIdsChange([...selectedTribeIds, tribeId]);
    } else {
      const next = selectedTribeIds.filter(id => id !== tribeId);
      onTribeIdsChange(next);
    }
  };

  const selected = RING_OPTIONS.find(r => r.value === value)!;
  const tribeNames = selectedTribeIds.length > 0 && tribes.length > 0
    ? selectedTribeIds.map(id => tribes.find(t => t.id === id)?.name).filter(Boolean).join(', ')
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs font-medium h-8"
          role="combobox"
          aria-expanded={open}
        >
          <span>{selected.emoji}</span>
          <span>{selected.label}</span>
          {value === 'tribes' && tribeNames && (
            <span className="text-muted-foreground max-w-[120px] truncate">
              — {tribeNames}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="p-2 space-y-0.5">
          <p className="text-xs font-medium text-muted-foreground px-2 py-1">Who can see this?</p>
          {RING_OPTIONS.map(opt => {
            const Icon = opt.icon;
            const isActive = value === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => handleRingSelect(opt.value)}
                className={cn(
                  "w-full flex items-start gap-2.5 px-2 py-2 rounded-md text-left transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted/50 text-foreground"
                )}
              >
                <Icon className={cn("h-4 w-4 mt-0.5 flex-shrink-0", isActive && "text-primary")} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{opt.emoji} {opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Tribe multi-select */}
        {value === 'tribes' && (
          <div className="border-t p-2">
            <p className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">Select tribe(s):</p>
            {loadingTribes ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : tribes.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">
                You haven&apos;t joined any tribes yet.
              </p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {tribes.map(tribe => (
                  <div key={tribe.id} className="flex items-center gap-2 px-2 py-1">
                    <Checkbox
                      id={`tribe-${tribe.id}`}
                      checked={selectedTribeIds.includes(tribe.id)}
                      onCheckedChange={(checked) => handleTribeToggle(tribe.id, !!checked)}
                    />
                    <Label htmlFor={`tribe-${tribe.id}`} className="text-sm font-normal cursor-pointer">
                      {tribe.name}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
