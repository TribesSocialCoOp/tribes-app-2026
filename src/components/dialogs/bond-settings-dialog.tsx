
"use client";

import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent as ShadDialogContent, DialogHeader as ShadDialogHeader, DialogTitle as ShadDialogTitle, DialogDescription as ShadDialogDescription, DialogFooter as ShadDialogFooter
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent as ShadSheetContent, SheetHeader as ShadSheetHeader, SheetTitle as ShadSheetTitle, SheetDescription as ShadSheetDescription, SheetFooter as ShadSheetFooter
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/use-mobile";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

type FormationMethod = "rfid_tap" | "digital_introduction" | "virtual_request";
type KeyType = "standard" | "event_promo" | "event_attendee";
type AccessTier = "spectator" | "attendee" | "vip";

// Minimal Bond interface for this dialog
export interface Bond {
  id: string;
  targetName: string;
  targetType: "user" | "tribe";
  bondType: "family" | "friend" | "professional" | "collaborator" | "follower" | "supporter";
  formationMethod: FormationMethod;
  showInIntercom?: boolean;
  allowChatInitiation?: boolean;
  keyType?: KeyType;
  eventId?: string;
  accessTier?: AccessTier;
}

interface BondSettingsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  bond: Bond | null;
  onSave: (updatedBond: Bond) => void;
}

const getBondTypeDisplay = (bondType: Bond["bondType"]): string => {
  switch (bondType) {
    case "family": return "Family";
    case "friend": return "Friend";
    case "professional": return "Professional";
    case "collaborator": return "Collaborator";
    case "follower": return "Follower";
    case "supporter": return "Supporter";
    default: return bondType;
  }
};

export function BondSettingsDialog({ isOpen, onOpenChange, bond, onSave }: BondSettingsDialogProps) {
  const isMobile = useIsMobile();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [allowChat, setAllowChat] = useState(true);

  useEffect(() => {
    if (isOpen && bond) {
      setNotificationsEnabled(bond.showInIntercom ?? true);
      setAllowChat(bond.allowChatInitiation ?? (bond.targetType === 'user' && !bond.keyType?.startsWith('event_')));
    }
  }, [isOpen, bond]);


  if (!bond) {
    return null;
  }

  const handleSaveSettings = () => {
    if (bond) {
        const updatedBond: Bond = {
            ...bond,
            showInIntercom: notificationsEnabled,
            allowChatInitiation: allowChat,
        };
        onSave(updatedBond);
    }
    onOpenChange(false);
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
        <DialogTitleComponent>Bond Settings: <span className="italic font-semibold">{bond.targetName}</span></DialogTitleComponent>
        <DialogDescriptionComponent>
          Manage preferences for your bond with <span className="italic font-semibold">{bond.targetName}</span> ({bond.targetType === 'user' ? 'User' : 'Tribe'} - {getBondTypeDisplay(bond.bondType)}).
          {bond.keyType && bond.keyType !== 'standard' && (
            <span className="block mt-2 text-xs text-purple-600 font-medium p-2 bg-purple-500/10 rounded-md">
              This is an '{bond.keyType.replace(/_/g, ' ')}' key {bond.eventId ? `for event '${bond.eventId}'` : ''} with '{bond.accessTier}' access.
            </span>
          )}
        </DialogDescriptionComponent>
      </DialogHeaderComponent>

      <div className="py-4 space-y-6 text-sm">
        <fieldset>
          <legend className="text-base font-semibold text-foreground mb-3">Notification Settings</legend>
          <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
            <Label htmlFor={`notifications-${bond.id}`} className="cursor-pointer flex-1 text-sm">
              Receive notifications for this bond
            </Label>
            <Switch
              id={`notifications-${bond.id}`}
              checked={notificationsEnabled}
              onCheckedChange={setNotificationsEnabled}
              aria-label="Toggle notifications for this bond"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1 px-1">
            Controls if updates from this bond appear in your Intercom feed.
          </p>
        </fieldset>

        <Separator />

        <fieldset>
          <legend className="text-base font-semibold text-foreground mb-3">Chat Settings</legend>
          <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
            <Label htmlFor={`allowChat-${bond.id}`} className="cursor-pointer flex-1 text-sm">
              Allow <span className="italic font-semibold">{bond.targetName}</span> to initiate chat with you
            </Label>
            <Switch
              id={`allowChat-${bond.id}`}
              checked={allowChat}
              onCheckedChange={setAllowChat}
              aria-label={`Toggle allowing ${bond.targetName} to initiate chat with you`}
              disabled={bond.targetType === 'tribe' || bond.keyType?.startsWith('event_')}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1 px-1">
            Controls if <span className="italic font-semibold">{bond.targetName}</span> ({bond.targetType}) can start new direct conversations with you.
            {bond.targetType === 'tribe' && " Tribes cannot initiate direct chats."}
            {bond.keyType?.startsWith('event_') && " Event pass holders typically cannot initiate direct chats."}
            {bond.allowChatInitiation === false && bond.targetType === 'user' && !bond.keyType?.startsWith('event_') && `${bond.targetName} currently has chat initiation disabled by you.`}
          </p>
        </fieldset>
      </div>

      <DialogFooterComponent className="pt-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={handleSaveSettings} className="bg-primary hover:bg-primary/90 text-primary-foreground">Save Changes</Button>
      </DialogFooterComponent>
    </>
  );


  if (isMobile) {
    return (
      <RootComponent open={isOpen} onOpenChange={onOpenChange}>
        <DialogContentComponent side="bottom" className="h-auto max-h-[80vh] flex flex-col p-0">
            <ScrollArea className="flex-1">
                 <div className="p-4 sm:p-6">
                    {commonContent}
                 </div>
            </ScrollArea>
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
