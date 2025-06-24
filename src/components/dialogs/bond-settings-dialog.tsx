
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
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import type { Bond } from '@/lib/types';
import { AtSign, UserCheck, UserCog, Info as InfoIcon, Flag, Heart, Smile, Meh } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";


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
  const [yourPseudonym, setYourPseudonym] = useState("");
  const [theirPseudonymForYou, setTheirPseudonymForYou] = useState("");
  const [displayPreference, setDisplayPreference] = useState<'my_alias' | 'tribe_assigned_nickname'>('my_alias');
  const [currentNicknameVibe, setCurrentNicknameVibe] = useState<Bond['tribeNicknameVibe'] | undefined>(undefined);


  useEffect(() => {
    if (isOpen && bond) {
      setNotificationsEnabled(bond.showInIntercom ?? true);
      setYourPseudonym(bond.pseudonym || "");
      if (bond.targetType === 'user') {
        setTheirPseudonymForYou(bond.targetPseudonymForMe || "");
      }
      setDisplayPreference(bond.displayPreferenceForTribeNickname || (bond.pseudonym ? 'my_alias' : 'tribe_assigned_nickname'));
      setCurrentNicknameVibe(bond.tribeNicknameVibe);
    } else if (!isOpen) {
      // Reset local state when dialog closes to ensure fresh state next time
      setNotificationsEnabled(true);
      setYourPseudonym("");
      setTheirPseudonymForYou("");
      setDisplayPreference('my_alias');
      setCurrentNicknameVibe(undefined);
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
            pseudonym: yourPseudonym.trim() || undefined,
            targetPseudonymForMe: bond.targetType === 'user' ? (theirPseudonymForYou.trim() || undefined) : undefined,
            displayPreferenceForTribeNickname: bond.targetType === 'tribe' && bond.tribeAssignedNickname ? displayPreference : undefined,
            tribeNicknameVibe: bond.targetType === 'tribe' && bond.tribeAssignedNickname ? currentNicknameVibe : undefined,
            isTribeNicknameReported: bond.isTribeNicknameReported 
        };
        onSave(updatedBond);
    }
    onOpenChange(false);
  };

  const handleNicknameVibe = (vibe: Bond['tribeNicknameVibe']) => {
    setCurrentNicknameVibe(prevVibe => prevVibe === vibe ? undefined : vibe);
  };

  const handleReportNickname = () => {
    if (bond) {
      alert(`Reporting nickname "${bond.tribeAssignedNickname}" for bond with ${bond.targetName}. (Simulated)`);
      onOpenChange(false); 
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
        <DialogTitleComponent>Bond Settings: <span className="italic font-semibold">{bond.targetName}</span></DialogTitleComponent>
        <DialogDescriptionComponent>
          Manage preferences for your bond with <span className="italic font-semibold">{bond.targetName}</span> ({bond.targetType === 'user' ? 'User' : 'Tribe'} - {getBondTypeDisplay(bond.bondType)}).
          {bond.keyType && bond.keyType !== 'standard' && (
            <span className="block mt-2 text-xs text-purple-600 font-medium p-2 bg-purple-500/10 rounded-md">
              This is an '{bond.keyType.replace(/_/g, ' ')}' key {bond.eventId ? `for event '${bond.eventId}'` : ''} {bond.accessTier ? `with '${bond.accessTier}' access` : ''}.
            </span>
          )}
        </DialogDescriptionComponent>
      </DialogHeaderComponent>

      <div className="py-4 space-y-6 text-sm">
        <fieldset>
          <legend className="text-base font-semibold text-foreground mb-3">Interaction Settings</legend>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                <Label htmlFor={`notifications-${bond.id}`} className="cursor-pointer flex-1 text-sm">
                Receive Intercom updates for this bond
                </Label>
                <Switch
                id={`notifications-${bond.id}`}
                checked={notificationsEnabled}
                onCheckedChange={setNotificationsEnabled}
                aria-label="Toggle Intercom updates for this bond"
                />
            </div>
          </div>
        </fieldset>

        <Separator />

        <fieldset className="space-y-4">
            <legend className="text-base font-semibold text-foreground mb-3">Alias & Nickname Settings</legend>
            
            <div>
                <Label htmlFor={`your-pseudonym-${bond.id}`} className="flex items-center mb-1.5">
                    <AtSign className="h-4 w-4 mr-2 text-primary"/>
                    Your Alias for <span className="italic font-semibold ml-1">{bond.targetName}</span>
                </Label>
                <Input
                    id={`your-pseudonym-${bond.id}`}
                    value={yourPseudonym}
                    onChange={(e) => setYourPseudonym(e.target.value)}
                    placeholder="e.g., TechGuru, ArtLover (optional)"
                    className="text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1 px-1">
                    How you appear to this bond target if set. Leave blank to use your main profile name.
                </p>
            </div>

              {bond.targetType === 'user' && (
                <div>
                    <Label htmlFor={`their-pseudonym-${bond.id}`} className="flex items-center mb-1.5">
                        <UserCheck className="h-4 w-4 mr-2 text-sky-600"/>
                        Their Alias for You (if known)
                    </Label>
                    <Input
                        id={`their-pseudonym-${bond.id}`}
                        value={theirPseudonymForYou}
                        onChange={(e) => setTheirPseudonymForYou(e.target.value)}
                        placeholder="e.g., CollaboratorX (optional)"
                        className="text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1 px-1">
                        If <span className="italic font-semibold">{bond.targetName}</span> uses an alias for you, note it here.
                    </p>
                </div>
            )}

            {bond.targetType === 'tribe' && bond.tribeAssignedNickname && (
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="tribe-nickname-controls" className="border rounded-lg overflow-hidden bg-muted/50">
                  <AccordionTrigger className="p-3 hover:no-underline w-full text-left data-[state=open]:border-b data-[state=open]:border-border">
                    <div className="flex items-center">
                      <UserCog className="h-4 w-4 mr-2 text-orange-500 flex-shrink-0"/>
                      <div className="flex-grow">
                        <span className="text-sm font-medium text-foreground">Your Nickname in this Tribe: <span className="italic font-semibold">{bond.tribeAssignedNickname}</span></span>
                        <p className="text-xs text-muted-foreground mt-0.5">This nickname is assigned by the tribe leadership.</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3 pt-2">
                    <div className="space-y-3">
                      <div>
                          <Label className="block mb-1.5 text-xs text-muted-foreground">Control how this name is displayed publicly within this tribe:</Label>
                          <RadioGroup value={displayPreference} onValueChange={(value) => setDisplayPreference(value as 'my_alias' | 'tribe_assigned_nickname')} className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="my_alias" id={`pref-alias-${bond.id}`} />
                              <Label htmlFor={`pref-alias-${bond.id}`} className="text-xs font-normal">Show My Alias ({yourPseudonym || "Profile Name"})</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="tribe_assigned_nickname" id={`pref-tribe-${bond.id}`} />
                              <Label htmlFor={`pref-tribe-${bond.id}`} className="text-xs font-normal">Show Tribe-Assigned Nickname ({bond.tribeAssignedNickname})</Label>
                            </div>
                          </RadioGroup>
                        </div>
                        
                        <div className="pt-2">
                          <Label className="block mb-1.5 text-xs text-muted-foreground">How do you feel about this nickname?</Label>
                          <div className="flex flex-wrap gap-2">
                              <Button variant={currentNicknameVibe === 'love_it' ? "default" : "outline"} size="sm" onClick={() => handleNicknameVibe('love_it')} className="text-xs px-2 py-1 h-auto">
                                  <Heart className={cn("mr-1.5 h-3.5 w-3.5", currentNicknameVibe === 'love_it' && "fill-current")}/> Love it!
                              </Button>
                              <Button variant={currentNicknameVibe === 'okay' ? "default" : "outline"} size="sm" onClick={() => handleNicknameVibe('okay')} className="text-xs px-2 py-1 h-auto">
                                  <Smile className={cn("mr-1.5 h-3.5 w-3.5", currentNicknameVibe === 'okay' && "fill-current")}/> It's Okay
                              </Button>
                              <Button variant={currentNicknameVibe === 'not_for_me' ? "default" : "outline"} size="sm" onClick={() => handleNicknameVibe('not_for_me')} className="text-xs px-2 py-1 h-auto">
                                  <Meh className={cn("mr-1.5 h-3.5 w-3.5", currentNicknameVibe === 'not_for_me' && "fill-current")}/> Not For Me
                              </Button>
                          </div>
                           <p className="text-xs text-muted-foreground/80 mt-1">Your feedback is valuable and may be shared with tribe leadership.</p>
                        </div>

                        <div className="pt-2">
                          <Button variant="link" size="sm" onClick={handleReportNickname} className="text-xs text-destructive hover:text-destructive/80 p-0 h-auto">
                              <Flag className="mr-1.5 h-3.5 w-3.5"/> Report Abusive Nickname
                          </Button>
                        </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
             {bond.targetType === 'tribe' && !bond.tribeAssignedNickname && (
                 <div className="p-3 rounded-lg border border-dashed">
                    <Label className="flex items-center mb-1">
                        <InfoIcon className="h-4 w-4 mr-2 text-muted-foreground"/>
                        Tribe-Assigned Nickname
                    </Label>
                    <p className="text-xs text-muted-foreground pl-6">
                        This tribe has not assigned you a specific nickname.
                    </p>
                </div>
            )}
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
        <DialogContentComponent side="bottom" className="h-auto max-h-[90vh] flex flex-col p-0">
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
