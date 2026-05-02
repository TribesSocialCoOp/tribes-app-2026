
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import type { Bond } from '@/lib/types';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { UserAvatar } from '@/components/ui/user-avatar';
import { User, Search } from 'lucide-react';
import {
  ResponsiveDialog, ResponsiveDialogHeader, ResponsiveDialogTitle,
  ResponsiveDialogDescription, ResponsiveDialogFooter
} from "@/components/ui/responsive-dialog";

interface IntroductionDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  introducingBond: Bond | null;
  allBonds: Bond[];
  onConfirmIntroduction: (bondToIntroduceTo: Bond) => void;
}

export function IntroductionDialog({
  isOpen,
  onOpenChange,
  introducingBond,
  allBonds,
  onConfirmIntroduction
}: IntroductionDialogProps) {
  const [selectedBondId, setSelectedBondId] = useState<string | undefined>(undefined);
  const [introSearchTerm, setIntroSearchTerm] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setSelectedBondId(undefined);
      setIntroSearchTerm("");
    }
  }, [isOpen]);

  const displayableEligibleBonds = useMemo(() => {
    if (!introducingBond) return [];
    return allBonds.filter(
      (bond) => bond.id !== introducingBond.id &&
                bond.targetType === 'user' &&
                bond.targetName.toLowerCase().includes(introSearchTerm.toLowerCase())
    );
  }, [allBonds, introducingBond, introSearchTerm]);

  if (!introducingBond) return null;

  const handleConfirm = () => {
    const bondToIntroduceTo = displayableEligibleBonds.find(b => b.id === selectedBondId);
    if (bondToIntroduceTo) {
      onConfirmIntroduction(bondToIntroduceTo);
    }
  };

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={onOpenChange} className="sm:max-w-xl">
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle>Introduce <span className="italic font-semibold">{introducingBond.targetName}</span> to...</ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          Select another user bond to facilitate an introduction.
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>

      <div className="py-4 space-y-4">
        <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
                type="search"
                placeholder="Search by name..."
                value={introSearchTerm}
                onChange={(e) => setIntroSearchTerm(e.target.value)}
                className="pl-8 w-full"
            />
        </div>

        {displayableEligibleBonds.length > 0 ? (
          <RadioGroup value={selectedBondId} onValueChange={setSelectedBondId}>
            <ScrollArea className="h-[200px] sm:h-[250px] pr-3">
              <div className="space-y-3">
                {displayableEligibleBonds.map((bond) => (
                  <Label
                    key={bond.id}
                    htmlFor={`bond-intro-${bond.id}`}
                    className="flex items-center space-x-3 p-3 rounded-md border hover:bg-muted/50 cursor-pointer has-[:checked]:bg-accent has-[:checked]:text-accent-foreground transition-colors"
                  >
                    <RadioGroupItem value={bond.id} id={`bond-intro-${bond.id}`} className="sr-only" />
                    <UserAvatar 
                      user={{ name: bond.targetName }} 
                      className="h-8 w-8" 
                    />
                    <span className="font-medium text-xs">{bond.targetName}</span>
                  </Label>
                ))}
              </div>
            </ScrollArea>
          </RadioGroup>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            {introSearchTerm ? "No matching users found." : "No other user bonds available for an introduction."}
          </p>
        )}
      </div>

      <ResponsiveDialogFooter className="pt-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          onClick={handleConfirm}
          disabled={!selectedBondId || displayableEligibleBonds.length === 0}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          Confirm Introduction
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
}
