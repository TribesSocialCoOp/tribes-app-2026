
"use client";

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Tribe } from '@/lib/types';
import { UserPlus, Loader2 } from 'lucide-react';
import { UserAvatar } from "@/components/ui/user-avatar";
import { avatarSvg } from "@/lib/placeholder-svg";
import type { UserProfile } from '@/lib/types';
import { getUserProfile } from '@/lib/actions/profile-actions';
import { getNsfwGateStatus } from '@/lib/actions/age-actions';
import { useUser } from '@/hooks/use-user';
import {
  ResponsiveDialog, ResponsiveDialogHeader, ResponsiveDialogTitle,
  ResponsiveDialogDescription, ResponsiveDialogFooter
} from "@/components/ui/responsive-dialog";

interface JoinTribeDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tribe: Tribe | null;
  onConfirmJoin: (tribe: Tribe, selectedAlias?: string, aliasAvatar?: string) => void;
  isJoining: boolean;
}

export function JoinTribeDialog({
  isOpen,
  onOpenChange,
  tribe,
  onConfirmJoin,
  isJoining,
}: JoinTribeDialogProps) {
  const [selectedIdentity, setSelectedIdentity] = useState<string>("main_profile");
  const { user: sessionUser, isLoading: isUserLoading } = useUser();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  // For NSFW tribes, which 18+ gate step (if any) will fire on join.
  const [gateStep, setGateStep] = useState<'verify' | 'optin' | 'blocked' | null>(null);

  useEffect(() => {
    if (isOpen && sessionUser) {
      setIsLoadingProfile(true);
      const fetchProfile = async () => {
        const profile = await getUserProfile(sessionUser.id);
        setUserProfile(profile);
        setIsLoadingProfile(false);
      };
      fetchProfile();
      setSelectedIdentity("main_profile");
    }
  }, [isOpen, sessionUser]);

  // Resolve which 18+ gate step (if any) will fire on join, so the confirm button and
  // hint reflect the FULL policy decision — not just verification. Mirrors the server
  // gate (resolveNsfwAccess): blocked region → blocked; law-state region without wallet
  // verification → verify; missing the web-set content toggle → optin; otherwise none.
  useEffect(() => {
    if (isOpen && tribe?.isNsfw) {
      setGateStep('verify'); // assume gated until proven otherwise (safer label)
      getNsfwGateStatus()
        .then(({ regionTier, hasOptIn, hasVerified }) => {
          setGateStep(
            regionTier === 'blocked' ? 'blocked'
              : regionTier === 'verify' && !hasVerified ? 'verify'
                : !hasOptIn ? 'optin'
                  : null,
          );
        })
        .catch(() => setGateStep('verify'));
    } else {
      setGateStep(null);
    }
  }, [isOpen, tribe?.id, tribe?.isNsfw]);

  if (!tribe) return null;

  const resolveAvatarForIdentity = (value: string): string | undefined => {
    if (value === "main_profile") return userProfile?.avatar || undefined;
    if (userProfile?.reservedAlias === value) return userProfile?.reservedAliasAvatar || avatarSvg(value);
    const matchedAlias = userProfile?.aliases.find(a => a.name === value);
    return matchedAlias?.avatar || avatarSvg(value);
  };

  const handleConfirm = () => {
    const isAlias = selectedIdentity !== "main_profile";
    // Strip '@' prefix from reserved aliases so DB stores bare name
    const aliasName = isAlias ? selectedIdentity.replace(/^@/, '') : undefined;
    const aliasAvatarUrl = isAlias ? resolveAvatarForIdentity(selectedIdentity) : undefined;
    onConfirmJoin(tribe, aliasName, aliasAvatarUrl);
  };
  
  const identityOptions = [
    { value: "main_profile", label: userProfile?.name || "Main Profile", isAlias: false },
    ...(userProfile?.reservedAlias
      ? [{ value: userProfile.reservedAlias, label: userProfile.reservedAlias, isAlias: true, isReserved: true }]
      : []),
    ...(userProfile?.aliases.map(a => ({ value: a.name, label: a.name, isAlias: true, isReserved: false })) || [])
  ];

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={onOpenChange} className="sm:max-w-md">
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle className="flex items-center">
          <UserPlus className="mr-2 h-5 w-5 text-primary" /> Join {tribe.name}
        </ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          Choose how you want to appear in this tribe. You can change this later from your Bond Settings.
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>

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
                    <UserAvatar 
                      user={{ name: option.label, avatar: resolveAvatarForIdentity(option.value) }} 
                      className="h-8 w-8 rounded-md shrink-0" 
                      fallback={option.isAlias ? option.value.substring(0, 2).toUpperCase() : (userProfile?.name?.substring(0, 2).toUpperCase() || '??')}
                    />
                    <span className="font-medium text-sm">{option.label}</span>
                  </Label>
                ))}
              </div>
            </ScrollArea>
          </RadioGroup>
        )}
        <p className="text-xs text-muted-foreground px-1">
          {gateStep === 'verify'
            ? "Next, you'll verify you're 18+ with your wallet. We store only a yes/no — never your ID or birthdate."
            : gateStep === 'optin'
              ? "Next, you'll confirm you're 18+ and enable adult content for your account."
              : gateStep === 'blocked'
                ? 'Adult content is not available in your region.'
                : tribe.joinMechanism === 'approval'
                  ? 'Your request to join will be sent to the tribe admins for approval.'
                  : 'You will join this tribe immediately.'}
        </p>
      </div>

      <ResponsiveDialogFooter className="pt-2">
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isJoining}>Cancel</Button>
        <Button
          onClick={handleConfirm}
          disabled={isJoining || isLoadingProfile}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {isJoining ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
          {isJoining
            ? "Joining..."
            : gateStep === 'verify'
              ? "Continue to age verification"
              : gateStep === 'optin'
                ? "Continue to 18+ confirmation"
                : "Confirm & Join"}
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
}
