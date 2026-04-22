
"use client";

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Tribe } from '@/lib/types';
import { UserPlus, UserCircle, AtSign, Loader2 } from 'lucide-react';
import type { UserProfile } from '@/lib/types';
import { getUserProfile } from '@/lib/actions/profile-actions';
import { useUser } from '@/hooks/use-user';
import {
  ResponsiveDialog, ResponsiveDialogHeader, ResponsiveDialogTitle,
  ResponsiveDialogDescription, ResponsiveDialogFooter
} from "@/components/ui/responsive-dialog";

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
  const [selectedIdentity, setSelectedIdentity] = useState<string>("main_profile");
  const { user: sessionUser, isLoading: isUserLoading } = useUser();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

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

  if (!tribe) return null;

  const handleConfirm = () => {
    const alias = selectedIdentity === "main_profile" ? undefined : selectedIdentity;
    onConfirmJoin(tribe, alias);
  };
  
  const identityOptions = [
    { value: "main_profile", label: userProfile?.name || "Main Profile", icon: UserCircle },
    ...(userProfile?.aliases.map(alias => ({ value: alias, label: alias, icon: AtSign })) || [])
  ];

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={onOpenChange} className="sm:max-w-md">
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle className="flex items-center">
          <UserPlus className="mr-2 h-5 w-5 text-primary" /> Join {tribe.name}
        </ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          Choose how you want to appear in this tribe. Your choice can be changed later in your Bond settings for this tribe.
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

      <ResponsiveDialogFooter className="pt-2">
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isJoining}>Cancel</Button>
        <Button
          onClick={handleConfirm}
          disabled={isJoining || isLoadingProfile}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {isJoining ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
          {isJoining ? "Joining..." : "Confirm & Join"}
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
}
