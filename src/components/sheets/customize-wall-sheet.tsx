
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

interface CustomizeWallSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  currentStyles: WallStyles;
  onSave: (newStyles: WallStyles) => void;
}

const colorOptions = [
  { label: 'Default', value: 'bg-background' },
  { label: 'Muted', value: 'bg-muted/50' },
  { label: 'Gray', value: 'bg-slate-200' },
  { label: 'Blue', value: 'bg-blue-100' },
  { label: 'Green', value: 'bg-green-100' },
  { label: 'Pink', value: 'bg-pink-100' },
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
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Customize Your Wall</SheetTitle>
          <SheetDescription>
            Change the appearance and layout of your personal wall.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100%-8rem)] pr-4">
            <div className="py-4 space-y-8">
                <fieldset>
                    <legend className="text-sm font-semibold text-foreground mb-2">Background Color</legend>
                    <RadioGroup
                        value={styles.backgroundColor}
                        onValueChange={(value) => setStyles(s => ({ ...s, backgroundColor: value }))}
                        className="grid grid-cols-3 gap-2"
                    >
                        {colorOptions.map(option => (
                        <Label key={option.value} className="cursor-pointer">
                            <RadioGroupItem value={option.value} className="sr-only" />
                            <div className={cn(
                                "h-16 w-full rounded-md border-2 flex items-center justify-center",
                                styles.backgroundColor === option.value ? 'border-primary' : 'border-muted'
                            )}>
                                <div className={cn("h-8 w-8 rounded-full", option.value)} />
                            </div>
                            <span className="block text-center text-xs mt-1">{option.label}</span>
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
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
