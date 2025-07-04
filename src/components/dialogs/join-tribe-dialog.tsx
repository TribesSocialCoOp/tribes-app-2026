
"use client";

import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent as ShadDialogContent, DialogHeader as ShadDialogHeader, DialogTitle as ShadDialogTitle, DialogDescription as ShadDialogDescription, DialogFooter as ShadDialogFooter
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent as ShadSheetContent, SheetHeader as ShadSheetHeader, SheetTitle as ShadSheetTitle, SheetDescription as ShadSheetDescription, SheetFooter as ShadSheetFooter
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMobile } from "@/hooks/use-mobile";
import type { Tribe } from '@/lib/data';
import { UserPlus, UserCircle, AtSign, Loader2 } from 'lucide-react';
import type { UserProfile } from '@/lib/types';
import { getUserProfile } from '@/lib/services/user-service';
import { MOCK_CURRENT_USER_ID } from '@/lib/data';

interface JoinTribeDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tribe: Tribe | null;
  onConfirmJoin: (tribe: Tribe, selectedAlias?: string) => void;
  isJoining: boolean;
}

export function JoinTribeDialog({
  isOpen,
  onOpenChange,
  tribe,
  onConfirmJoin,
  isJoining,
}: JoinTribeDialogProps) {
  const isMobile = useIsMobile();
  const [selectedIdentity, setSelectedIdentity] = useState<string>("main_profile");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setIsLoadingProfile(true);
      const fetchProfile = async () => {
        const profile = await getUserProfile(MOCK_CURRENT_USER_ID);
        setUserProfile(profile);
        setIsLoadingProfile(false);
      };
      fetchProfile();
      // Reset selection when dialog opens
      setSelectedIdentity("main_profile");
    }
  }, [isOpen]);

  if (!tribe) {
    return null;
  }

  const handleConfirm = () => {
    const alias = selectedIdentity === "main_profile" ? undefined : selectedIdentity;
    onConfirmJoin(tribe, alias);
  };
  
  const identityOptions = [
    { value: "main_profile", label: userProfile?.name || "Main Profile", icon: UserCircle },
    ...(userProfile?.aliases.map(alias => ({ value: alias, label: alias, icon: AtSign })) || [])
  ];

  const DialogContentComponent = isMobile ? ShadSheetContent : ShadDialogContent;
  const DialogHeaderComponent = isMobile ? ShadSheetHeader : ShadDialogHeader;
  const DialogTitleComponent = isMobile ? ShadSheetTitle : ShadDialogTitle;
  const DialogDescriptionComponent = isMobile ? ShadSheetDescription : ShadDialogDescription;
  const DialogFooterComponent = isMobile ? ShadSheetFooter : ShadDialogFooter;
  const RootComponent = isMobile ? Sheet : Dialog;

  const commonContent = (
    <>
      <DialogHeaderComponent>
        <DialogTitleComponent className="flex items-center">
          <UserPlus className="mr-2 h-5 w-5 text-primary" /> Join {tribe.name}
        </DialogTitleComponent>
        <DialogDescriptionComponent>
          Choose how you want to appear in this tribe. Your choice can be changed later in your Bond settings for this tribe.
        </DialogDescriptionComponent>
      </DialogHeaderComponent>

      <div className="py-4 space-y-4">
        {isLoadingProfile ? (
          <div className="flex items-center justify-center h-24">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <RadioGroup value={selectedIdentity} onValueChange={setSelectedIdentity}>
            <ScrollArea className="h-auto max-h-[40vh]">
              <div className="space-y-3 pr-3">
                {identityOptions.map((option) => (
                  <Label
                    key={option.value}
                    htmlFor={`identity-${option.value}`}
                    className="flex items-center space-x-3 p-3 rounded-md border hover:bg-muted/50 cursor-pointer has-[:checked]:bg-accent has-[:checked]:border-primary has-[:checked]:text-accent-foreground transition-colors"
                  >
                    <RadioGroupItem value={option.value} id={`identity-${option.value}`} className="border-primary" />
                    <option.icon className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium text-sm">{option.label}</span>
                  </Label>
                ))}
              </div>
            </ScrollArea>
          </RadioGroup>
        )}
        <p className="text-xs text-muted-foreground px-1">
          {tribe.joinMechanism === 'approval' ? 'Your request to join will be sent to the tribe admins for approval.' : 'You will join this tribe immediately.'}
        </p>
      </div>

      <DialogFooterComponent className="pt-2">
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isJoining}>Cancel</Button>
        <Button
          onClick={handleConfirm}
          disabled={isJoining || isLoadingProfile}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {isJoining ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
          {isJoining ? "Joining..." : "Confirm & Join"}
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
      <DialogContentComponent className="sm:max-w-md p-6">
        {commonContent}
      </DialogContentComponent>
    </RootComponent>
  );
}
