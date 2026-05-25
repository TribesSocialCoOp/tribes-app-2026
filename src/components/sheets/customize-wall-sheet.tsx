
"use client";

import React, { useState, useEffect } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { WallStyles } from '@/app/(app)/my-wall/page';

import { useIsMobile } from '@/hooks/use-mobile';

interface CustomizeWallSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  currentStyles: WallStyles;
  onSave: (newStyles: WallStyles) => void;
}

const colorOptions = [
  // ── Neutrals ──
  { label: 'Default',   value: 'bg-background',                          swatch: 'bg-background border border-border' },
  { label: 'Muted',     value: 'bg-muted/50',                            swatch: 'bg-muted/50' },
  { label: 'Slate',     value: 'bg-slate-200 dark:bg-slate-800',         swatch: 'bg-slate-200 dark:bg-slate-800' },
  { label: 'Stone',     value: 'bg-stone-200 dark:bg-stone-800',         swatch: 'bg-stone-200 dark:bg-stone-800' },
  // ── Cool ──
  { label: 'Sky',       value: 'bg-sky-100 dark:bg-sky-950',             swatch: 'bg-sky-100 dark:bg-sky-950' },
  { label: 'Blue',      value: 'bg-blue-100 dark:bg-blue-950',           swatch: 'bg-blue-100 dark:bg-blue-950' },
  { label: 'Indigo',    value: 'bg-indigo-100 dark:bg-indigo-950',       swatch: 'bg-indigo-100 dark:bg-indigo-950' },
  { label: 'Teal',      value: 'bg-teal-100 dark:bg-teal-950',           swatch: 'bg-teal-100 dark:bg-teal-950' },
  // ── Earthy / Warm ──
  { label: 'Green',     value: 'bg-green-100 dark:bg-green-950',         swatch: 'bg-green-100 dark:bg-green-950' },
  { label: 'Emerald',   value: 'bg-emerald-100 dark:bg-emerald-950',     swatch: 'bg-emerald-100 dark:bg-emerald-950' },
  { label: 'Amber',     value: 'bg-amber-100 dark:bg-amber-950',         swatch: 'bg-amber-100 dark:bg-amber-950' },
  { label: 'Orange',    value: 'bg-orange-100 dark:bg-orange-950',       swatch: 'bg-orange-100 dark:bg-orange-950' },
  // ── Expressive ──
  { label: 'Rose',      value: 'bg-rose-100 dark:bg-rose-950',           swatch: 'bg-rose-100 dark:bg-rose-950' },
  { label: 'Pink',      value: 'bg-pink-100 dark:bg-pink-950',           swatch: 'bg-pink-100 dark:bg-pink-950' },
  { label: 'Fuchsia',   value: 'bg-fuchsia-100 dark:bg-fuchsia-950',     swatch: 'bg-fuchsia-100 dark:bg-fuchsia-950' },
  { label: 'Violet',    value: 'bg-violet-100 dark:bg-violet-950',       swatch: 'bg-violet-100 dark:bg-violet-950' },
];

const layoutOptions = [
    { label: 'Single Column', value: 'single-column' },
    { label: 'Two Columns', value: 'two-column' },
];

export function CustomizeWallSheet({
  isOpen,
  onOpenChange,
  currentStyles,
  onSave,
}: CustomizeWallSheetProps) {
  const [styles, setStyles] = useState<WallStyles>(currentStyles);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isOpen) {
      setStyles(currentStyles);
    }
  }, [isOpen, currentStyles]);

  const handleSave = () => {
    onSave(styles);
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn(
          "flex flex-col gap-4 bg-background p-6 shadow-lg transition ease-in-out duration-300",
          isMobile ? "h-auto max-h-[90vh] rounded-t-[20px] border-t" : "h-full w-[400px] sm:w-[540px]"
        )}
        style={isMobile ? { maxHeight: '90vh' } : undefined}
      >
        <SheetHeader className={cn(isMobile ? "text-left" : "")}>
          <SheetTitle>Customize Your Wall</SheetTitle>
          <SheetDescription>
            Change the appearance and layout of your personal wall.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className={cn(isMobile ? "flex-1 overflow-y-auto min-h-0 pr-2" : "h-[calc(100%-8rem)] pr-4")}>
            <div className="py-2 space-y-6">
                <fieldset>
                    <legend className="text-sm font-semibold text-foreground mb-2">Background Color</legend>
                    <RadioGroup
                        value={styles.backgroundColor}
                        onValueChange={(value) => setStyles(s => ({ ...s, backgroundColor: value }))}
                        className="grid grid-cols-4 gap-2"
                    >
                        {colorOptions.map(option => (
                        <Label key={option.value} className="cursor-pointer">
                            <RadioGroupItem value={option.value} className="sr-only" />
                            <div className={cn(
                                "h-14 w-full rounded-md border-2 flex items-center justify-center transition-colors",
                                styles.backgroundColor === option.value ? 'border-primary ring-2 ring-primary/30' : 'border-muted hover:border-muted-foreground/40'
                            )}>
                                <div className={cn("h-7 w-7 rounded-full relative", option.swatch)}>
                                  {styles.backgroundColor === option.value && (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <svg className="h-3.5 w-3.5 text-primary drop-shadow-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                                    </div>
                                  )}
                                </div>
                            </div>
                            <span className="block text-center text-[10px] mt-1 text-muted-foreground leading-tight">{option.label}</span>
                        </Label>
                        ))}
                    </RadioGroup>
                </fieldset>

                <fieldset>
                    <legend className="text-sm font-semibold text-foreground mb-2">Layout</legend>
                    <RadioGroup
                        value={styles.layout}
                        onValueChange={(value) => setStyles(s => ({ ...s, layout: value as WallStyles['layout'] }))}
                        className="space-y-2"
                    >
                        {layoutOptions.map(option => (
                            <Label key={option.value} className="flex items-center space-x-3 p-3 border rounded-md has-[:checked]:border-primary has-[:checked]:bg-muted/80 cursor-pointer">
                                <RadioGroupItem value={option.value} />
                                <span>{option.label}</span>
                            </Label>
                        ))}
                    </RadioGroup>
                </fieldset>
            </div>
        </ScrollArea>
        <SheetFooter className={cn(isMobile ? "flex-row gap-2 justify-end pt-2 border-t mt-auto" : "")}>
          <Button variant="outline" onClick={() => onOpenChange(false)} className={cn(isMobile ? "flex-1" : "")}>Cancel</Button>
          <Button onClick={handleSave} className={cn(isMobile ? "flex-1" : "")}>Save Changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
