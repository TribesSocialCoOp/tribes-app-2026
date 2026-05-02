
"use client";

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import type { Bond } from '@/lib/types';
import type { UserProfile } from '@/lib/types';
import { AtSign, UserCheck, UserCog, Info as InfoIcon, Flag, Heart, Smile, Meh, ShieldCheck, Users, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  ResponsiveDialog, ResponsiveDialogHeader, ResponsiveDialogTitle,
  ResponsiveDialogDescription, ResponsiveDialogFooter
} from "@/components/ui/responsive-dialog";
import { getBondTypeDisplay } from '@/lib/bond-utils';
import { UserAvatar } from "@/components/ui/user-avatar";
import { avatarSvg } from "@/lib/placeholder-svg";
import { getUserProfile } from '@/lib/actions/profile-actions';
import { updateTribeMemberIdentity } from '@/lib/actions/tribe-actions';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';


interface BondSettingsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  bond: Bond | null;
  onSave: (updatedBond: Bond) => void;
}



export function BondSettingsDialog({ isOpen, onOpenChange, bond, onSave }: BondSettingsDialogProps) {
  const { user: sessionUser } = useUser();
  const { toast } = useToast();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [yourPseudonym, setYourPseudonym] = useState("");
  const [theirPseudonymForYou, setTheirPseudonymForYou] = useState("");
  const [displayPreference, setDisplayPreference] = useState<'my_alias' | 'tribe_assigned_nickname'>('my_alias');
  const [currentNicknameVibe, setCurrentNicknameVibe] = useState<Bond['tribeNicknameVibe'] | undefined>(undefined);
  const [innerCircle, setInnerCircle] = useState(false);

  // ── Tribe identity switching state ──
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [selectedTribeIdentity, setSelectedTribeIdentity] = useState<string>("main_profile");
  const [isSavingIdentity, setIsSavingIdentity] = useState(false);

  useEffect(() => {
    if (isOpen && bond) {
      setNotificationsEnabled(bond.showInIntercom ?? true);
      setYourPseudonym(bond.pseudonym || "");
      if (bond.targetType === 'user') {
        setTheirPseudonymForYou(bond.targetPseudonymForMe || "");
      }
      setDisplayPreference(bond.displayPreferenceForTribeNickname || (bond.pseudonym ? 'my_alias' : 'tribe_assigned_nickname'));
      setCurrentNicknameVibe(bond.tribeNicknameVibe);
      setInnerCircle(bond.innerCircle ?? false);

      // Load user profile for tribe identity picker
      if (bond.targetType === 'tribe' && sessionUser) {
        setIsLoadingProfile(true);
        getUserProfile(sessionUser.id).then(profile => {
          setUserProfile(profile);
          // Pre-select current identity
          if (bond.pseudonym) {
            // Try to match pseudonym to an alias
            if (bond.tribeAssignedNickname && bond.pseudonym === bond.tribeAssignedNickname) {
              setSelectedTribeIdentity(`nickname:${bond.tribeAssignedNickname}`);
            } else {
              const matchesReserved = profile?.reservedAlias?.replace(/^@/, '') === bond.pseudonym;
              const matchesAlias = profile?.aliases.find(a => a.name === bond.pseudonym);
              if (matchesReserved && profile?.reservedAlias) {
                setSelectedTribeIdentity(profile.reservedAlias);
              } else if (matchesAlias) {
                setSelectedTribeIdentity(matchesAlias.name);
              } else {
                setSelectedTribeIdentity(bond.pseudonym);
              }
            }
          } else {
            setSelectedTribeIdentity("main_profile");
          }
          setIsLoadingProfile(false);
        });
      }
    } else if (!isOpen) {
      setNotificationsEnabled(true);
      setYourPseudonym("");
      setTheirPseudonymForYou("");
      setDisplayPreference('my_alias');
      setCurrentNicknameVibe(undefined);
      setInnerCircle(false);
      setSelectedTribeIdentity("main_profile");
      setUserProfile(null);
    }
  }, [isOpen, bond, sessionUser]);


  if (!bond) return null;

  const resolveAvatarForIdentity = (value: string): string | undefined => {
    if (value === "main_profile") return userProfile?.avatar || undefined;
    if (userProfile?.reservedAlias === value) return userProfile?.reservedAliasAvatar || avatarSvg(value);
    const matchedAlias = userProfile?.aliases.find(a => a.name === value);
    return matchedAlias?.avatar || avatarSvg(value);
  };

  const tribeIdentityOptions = [
    { value: "main_profile", label: userProfile?.name || "Main Profile", isAlias: false },
    ...(bond?.tribeAssignedNickname
      ? [{ value: `nickname:${bond.tribeAssignedNickname}`, label: `${bond.tribeAssignedNickname} (tribe nickname)`, isAlias: true }]
      : []),
    ...(userProfile?.reservedAlias
      ? [{ value: userProfile.reservedAlias, label: userProfile.reservedAlias, isAlias: true }]
      : []),
    ...(userProfile?.aliases.map(a => ({ value: a.name, label: a.name, isAlias: true })) || [])
  ];

  const handleSaveSettings = async () => {
    if (bond) {
        // ── Save tribe identity if changed ──
        if (bond.targetType === 'tribe' && bond.targetId) {
          const isAlias = selectedTribeIdentity !== "main_profile";
          const isNickname = selectedTribeIdentity.startsWith('nickname:');
          const aliasName = isAlias
            ? (isNickname ? selectedTribeIdentity.replace('nickname:', '') : selectedTribeIdentity.replace(/^@/, ''))
            : undefined;
          const aliasAvatarUrl = isAlias ? resolveAvatarForIdentity(selectedTribeIdentity) : undefined;
          try {
            setIsSavingIdentity(true);
            await updateTribeMemberIdentity(bond.targetId, aliasName, aliasAvatarUrl);
          } catch (err: unknown) {
            toast({ variant: 'destructive', title: 'Identity Update Failed', description: ((err instanceof Error) ? err.message : 'An error occurred') });
          } finally {
            setIsSavingIdentity(false);
          }
        }

        const updatedBond: Bond = {
            ...bond,
            showInIntercom: notificationsEnabled,
            pseudonym: yourPseudonym.trim() || undefined,
            targetPseudonymForMe: bond.targetType === 'user' ? (theirPseudonymForYou.trim() || undefined) : undefined,
            displayPreferenceForTribeNickname: bond.targetType === 'tribe' && bond.tribeAssignedNickname ? displayPreference : undefined,
            tribeNicknameVibe: bond.targetType === 'tribe' && bond.tribeAssignedNickname ? currentNicknameVibe : undefined,
            isTribeNicknameReported: bond.isTribeNicknameReported,
            innerCircle: bond.targetType === 'user' ? innerCircle : bond.innerCircle,
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
      alert(`Reporting nickname "${bond.tribeAssignedNickname}" for bond with ${bond.targetName}.`);
      onOpenChange(false); 
    }
  };

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={onOpenChange}>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle>Bond Settings: <span className="italic font-semibold">{bond.targetName}</span></ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          Manage preferences for your bond with <span className="italic font-semibold">{bond.targetName}</span> ({bond.targetType === 'user' ? 'User' : 'Tribe'} - {getBondTypeDisplay(bond)}).
          {bond.keyType && bond.keyType !== 'standard' && (
            <span className="block mt-2 text-xs text-purple-600 font-medium p-2 bg-purple-500/10 rounded-md">
              This is an '{bond.keyType.replace(/_/g, ' ')}' key {bond.eventId ? `for event '${bond.eventId}'` : ''} {bond.accessTier ? `with '${bond.accessTier}' access` : ''}.
            </span>
          )}
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>

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

        {bond.targetType === 'user' && (
          <>
            <Separator />
            <fieldset>
              <legend className="text-base font-semibold text-foreground mb-3">Trust Level</legend>
              <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                <div className="flex-1">
                  <Label htmlFor={`inner-circle-${bond.id}`} className="cursor-pointer text-sm flex items-center">
                    <ShieldCheck className="h-4 w-4 mr-2 text-emerald-600" />
                    Inner Circle
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5 pl-6">
                    Add to your Inner Circle. Only you can see this — they won&apos;t be notified.
                  </p>
                </div>
                <Switch
                  id={`inner-circle-${bond.id}`}
                  checked={innerCircle}
                  onCheckedChange={setInnerCircle}
                  aria-label="Toggle Inner Circle membership for this bond"
                />
              </div>
            </fieldset>
          </>
        )}

        <Separator />

        {/* ── Tribe Identity Picker (tribe bonds only) ── */}
        {bond.targetType === 'tribe' && (
          <>
            <fieldset className="space-y-4">
              <legend className="text-base font-semibold text-foreground mb-3 flex items-center">
                <Users className="h-4 w-4 mr-2 text-primary" />
                Tribe Identity
              </legend>
              <p className="text-xs text-muted-foreground -mt-2">
                Choose how you appear in this tribe. This changes your visible name and avatar for all tribe activity.
              </p>
              {isLoadingProfile ? (
                <div className="flex items-center justify-center h-16">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <RadioGroup value={selectedTribeIdentity} onValueChange={setSelectedTribeIdentity}>
                  <ScrollArea className="h-auto max-h-[30vh]">
                    <div className="space-y-2">
                      {tribeIdentityOptions.map((option) => (
                        <Label
                          key={option.value}
                          htmlFor={`tribe-id-${option.value}`}
                          className="flex items-center space-x-3 p-3 rounded-md border hover:bg-muted/50 cursor-pointer has-[:checked]:bg-accent has-[:checked]:border-primary has-[:checked]:text-accent-foreground transition-colors"
                        >
                          <RadioGroupItem value={option.value} id={`tribe-id-${option.value}`} className="border-primary" />
                          <UserAvatar
                            user={{ name: option.label, avatar: resolveAvatarForIdentity(option.value) }}
                            className="h-8 w-8 rounded-md shrink-0"
                            fallback={option.isAlias ? option.label.replace(/^@/, '').substring(0, 2).toUpperCase() : (userProfile?.name?.substring(0, 2).toUpperCase() || '??')}
                          />
                          <span className="font-medium text-sm">{option.label}</span>
                        </Label>
                      ))}
                    </div>
                  </ScrollArea>
                </RadioGroup>
              )}

              {/* ── Inline nickname controls (when a nickname is assigned) ── */}
              {bond.tribeAssignedNickname && (
                <div className="mt-3 space-y-3 p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center text-sm text-muted-foreground">
                    <UserCog className="h-4 w-4 mr-2 text-orange-500 shrink-0" />
                    <span>
                      Nickname <span className="italic font-semibold text-foreground">{bond.tribeAssignedNickname}</span> was assigned by tribe leadership.
                    </span>
                  </div>

                  <div>
                    <Label className="block mb-1.5 text-xs text-muted-foreground">How do you feel about this nickname?</Label>
                    <div className="flex flex-wrap gap-2">
                      <Button variant={currentNicknameVibe === 'love_it' ? "default" : "outline"} size="sm" onClick={() => handleNicknameVibe('love_it')} className="text-xs px-2 py-1 h-auto">
                        <Heart className={cn("mr-1.5 h-3.5 w-3.5", currentNicknameVibe === 'love_it' && "fill-current")}/> Love it!
                      </Button>
                      <Button variant={currentNicknameVibe === 'okay' ? "default" : "outline"} size="sm" onClick={() => handleNicknameVibe('okay')} className="text-xs px-2 py-1 h-auto">
                        <Smile className={cn("mr-1.5 h-3.5 w-3.5", currentNicknameVibe === 'okay' && "fill-current")}/> It&apos;s Okay
                      </Button>
                      <Button variant={currentNicknameVibe === 'not_for_me' ? "default" : "outline"} size="sm" onClick={() => handleNicknameVibe('not_for_me')} className="text-xs px-2 py-1 h-auto">
                        <Meh className={cn("mr-1.5 h-3.5 w-3.5", currentNicknameVibe === 'not_for_me' && "fill-current")}/> Not For Me
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground/80 mt-1">Your feedback may be shared with tribe leadership.</p>
                  </div>

                  <Button variant="link" size="sm" onClick={handleReportNickname} className="text-xs text-destructive hover:text-destructive/80 p-0 h-auto">
                    <Flag className="mr-1.5 h-3.5 w-3.5"/> Report Abusive Nickname
                  </Button>
                </div>
              )}
            </fieldset>
          </>
        )}

        {/* ── Alias & Nickname Settings (user bonds only) ── */}
        {bond.targetType === 'user' && (
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
        </fieldset>
        )}
      </div>

      <ResponsiveDialogFooter className="pt-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={handleSaveSettings} disabled={isSavingIdentity} className="bg-primary hover:bg-primary/90 text-primary-foreground">
          {isSavingIdentity ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : 'Save Changes'}
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
}
