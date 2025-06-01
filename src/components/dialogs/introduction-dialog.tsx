
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogContent as ShadDialogContent, DialogHeader as ShadDialogHeader, DialogTitle as ShadDialogTitle, DialogDescription as ShadDialogDescription, DialogFooter as ShadDialogFooter
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent as ShadSheetContent, SheetHeader as ShadSheetHeader, SheetTitle as ShadSheetTitle, SheetDescription as ShadSheetDescription, SheetFooter as ShadSheetFooter
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { useIsMobile } from "@/hooks/use-mobile";
import type { Bond } from '@/app/(app)/bonds/page'; 
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, Search } from 'lucide-react';

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
  const isMobile = useIsMobile();
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

  if (!introducingBond) {
    return null;
  }

  const handleConfirm = () => {
    const bondToIntroduceTo = displayableEligibleBonds.find(b => b.id === selectedBondId);
    if (bondToIntroduceTo) {
      onConfirmIntroduction(bondToIntroduceTo);
    }
  };

  const DialogContentComponent = isMobile ? ShadSheetContent : ShadDialogContent;
  const DialogHeaderComponent = isMobile ? ShadSheetHeader : ShadDialogHeader;
  const DialogTitleComponent = isMobile ? ShadSheetTitle : ShadDialogTitle;
  const DialogDescriptionComponent = isMobile ? ShadSheetDescription : ShadDialogDescription;
  const DialogFooterComponent = isMobile ? ShadSheetFooter : ShadDialogFooter;
  const RootComponent = isMobile ? Sheet : Dialog;

  const commonContent = (
    <>
      <DialogHeaderComponent>
        <DialogTitleComponent>Introduce <span className="italic font-semibold">{introducingBond.targetName}</span> to...</DialogTitleComponent>
        <DialogDescriptionComponent>
          Select another user bond to facilitate an introduction.
        </DialogDescriptionComponent>
      </DialogHeaderComponent>

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
                    <Avatar className="h-8 w-8">
                       {/* Using a generic User icon for now, ideally bond.targetAvatar or similar */}
                      <AvatarFallback><User className="h-4 w-4" /></AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-sm">{bond.targetName}</span>
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

      <DialogFooterComponent className="pt-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          onClick={handleConfirm}
          disabled={!selectedBondId || displayableEligibleBonds.length === 0}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          Confirm Introduction
        </Button>
      </DialogFooterComponent>
    </>
  );

  if (isMobile) {
    return (
      <RootComponent open={isOpen} onOpenChange={onOpenChange}>
        <DialogContentComponent side="bottom" className="h-auto max-h-[80vh] flex flex-col p-0">
          <div className="p-4 sm:p-6 overflow-y-auto">
            {commonContent}
          </div>
        </DialogContentComponent>
      </RootComponent>
    );
  }

  return (
    <RootComponent open={isOpen} onOpenChange={onOpenChange}>
      <DialogContentComponent className="sm:max-w-lg p-6">
        {commonContent}
      </DialogContentComponent>
    </RootComponent>
  );
}
