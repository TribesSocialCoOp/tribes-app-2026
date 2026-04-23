
"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserCircle, Loader2, PlusCircle, AtSign, X, Star, CreditCard, Mail, AlertTriangle, Cpu } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { UserProfile } from '@/lib/types';
import { getUserProfile, updateUserProfile } from '@/lib/actions/profile-actions';
import { getNotificationPreferences, saveNotificationPreferences } from '@/lib/actions/content-actions';
import { resendVerificationEmail } from '@/lib/actions/auth-email-actions';
import { getActiveSessions, revokeSession, revokeAllOtherSessions } from '@/lib/actions/auth-actions';
import { uploadFile } from '@/lib/upload';
import { useUser } from '@/hooks/use-user';

// Extracted settings sections
import { ReputationSection } from '@/components/settings/reputation-section';
import { NotificationsSection, type NotifPrefsState } from '@/components/settings/notifications-section';
import { SecuritySection } from '@/components/settings/security-section';
import { SessionsSection } from '@/components/settings/sessions-section';
import { AppearanceSection, BillingSection, AccountActionsSection } from '@/components/settings/minor-sections';
import { AiSettingsSection } from '@/components/settings/ai-settings-section';
export default function SettingsPage() {
  const { toast } = useToast();
  const { role, user: sessionUser, isLoading: isUserLoading } = useUser();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Identity form state
  const [givenName, setGivenName] = useState("");
  const [bio, setBio] = useState("");
  const [aliases, setAliases] = useState<string[]>([]);
  const [newAlias, setNewAlias] = useState("");
  const [reservedAliasInput, setReservedAliasInput] = useState('');
  const [isSavingAlias, setIsSavingAlias] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  // Email verification banner state
  const [verifyBannerDismissed, setVerifyBannerDismissed] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  // Notification preferences state
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefsState>({
    pushEnabled: true, emailEnabled: true, mentionsEnabled: true,
    bondMessagesEnabled: true, tribeActivityEnabled: true, eventRemindersEnabled: true,
  });
  const [isSavingNotifPrefs, setIsSavingNotifPrefs] = useState(false);

  // Session management state
  const [activeSessions, setActiveSessions] = useState<Array<{
    id: string;
    userAgent: string | null;
    createdAt: Date | null;
    isCurrent: boolean;
  }>>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isRevokingSession, setIsRevokingSession] = useState<string | null>(null);

  // Passkey management state
  const [passkeys, setPasskeys] = useState<{ id: string; createdAt: Date }[]>([]);
  const [userTotpEnabled, setUserTotpEnabled] = useState(false);
  const [userAiSharing, setUserAiSharing] = useState(true);

  // Load notification preferences
  useEffect(() => {
    async function loadNotifPrefs() {
      const prefs = await getNotificationPreferences();
      if (prefs) setNotifPrefs(prefs);
    }
    if (sessionUser) loadNotifPrefs();
  }, [sessionUser]);

  async function handleSaveNotifPrefs() {
    setIsSavingNotifPrefs(true);
    try {
      await saveNotificationPreferences(notifPrefs);
      toast({ title: 'Saved', description: 'Notification preferences updated.' });
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Error', description: ((err instanceof Error) ? err.message : 'An error occurred') });
    } finally {
      setIsSavingNotifPrefs(false);
    }
  }

  // Load active sessions
  async function loadSessions() {
    setIsLoadingSessions(true);
    try {
      const sessions = await getActiveSessions();
      setActiveSessions(sessions);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setIsLoadingSessions(false);
    }
  }

  useEffect(() => {
    if (sessionUser) {
      loadSessions();
      loadPasskeys();
    }
  }, [sessionUser]);

  // Load passkeys + security state
  async function loadPasskeys() {
    try {
      const { getRegisteredPasskeys } = await import('@/lib/actions/auth-actions');
      const keys = await getRegisteredPasskeys();
      setPasskeys(keys);
    } catch (err) {
      console.error('Failed to load passkeys:', err);
    }
  }

  async function handleRevokeSession(sessionId: string) {
    setIsRevokingSession(sessionId);
    try {
      await revokeSession(sessionId);
      setActiveSessions(prev => prev.filter(s => s.id !== sessionId));
      toast({ title: 'Session Revoked', description: 'The session has been signed out.' });
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Error', description: ((err instanceof Error) ? err.message : 'An error occurred') });
    } finally {
      setIsRevokingSession(null);
    }
  }

  async function handleRevokeAllOther() {
    setIsRevokingSession('all');
    try {
      await revokeAllOtherSessions();
      setActiveSessions(prev => prev.filter(s => s.isCurrent));
      toast({ title: 'All Sessions Revoked', description: 'All other devices have been signed out.' });
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Error', description: ((err instanceof Error) ? err.message : 'An error occurred') });
    } finally {
      setIsRevokingSession(null);
    }
  }

  // Profile fetch
  useEffect(() => {
    const fetchProfile = async () => {
      if (!sessionUser) return;
      setIsLoading(true);
      const userProfile = await getUserProfile(sessionUser.id);
      if (userProfile) {
        setProfile(userProfile);
        setGivenName(userProfile.name);
        setBio(userProfile.bio || "");
        setAliases(userProfile.aliases || []);
        setReservedAliasInput(userProfile.reservedAlias || "");
        setUserTotpEnabled(userProfile.totpEnabled ?? false);
        setUserAiSharing(userProfile.aiDataSharingEnabled ?? true);
      }
      setIsLoading(false);
    };
    if (!isUserLoading) {
        fetchProfile();
    }
  }, [sessionUser, isUserLoading]);
  
  const handleAddAlias = () => {
    if (newAlias.trim() && !aliases.includes(newAlias.trim())) {
      setAliases([...aliases, newAlias.trim()]);
      setNewAlias("");
    }
  };

  const handleRemoveAlias = (aliasToRemove: string) => {
    setAliases(aliases.filter(alias => alias !== aliasToRemove));
  };

  const handleSaveChanges = async () => {
    if (!profile) return;
    setIsSaving(true);
    
    try {
      await updateUserProfile(profile.id, {
        name: givenName,
        bio: bio,
        aliases: aliases,
      });
      toast({
        title: "Profile Saved",
        description: "Your identity and profile information has been updated.",
      });
    } catch (error) {
       toast({
        variant: "destructive",
        title: "Save Failed",
        description: "There was an error saving your profile. Please try again."
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleReserveAlias = async () => {
    if (!profile) return;

    if (!reservedAliasInput.startsWith('@')) {
        toast({
            variant: "destructive",
            title: "Invalid Alias",
            description: "Your reserved alias must start with an '@' symbol."
        });
        return;
    }
    if (reservedAliasInput.length < 4) {
        toast({
            variant: "destructive",
            title: "Alias Too Short",
            description: "Your reserved alias must be at least 3 characters long, plus the '@'."
        });
        return;
    }

    setIsSavingAlias(true);
    
    try {
      await updateUserProfile(profile.id, {
        reservedAlias: reservedAliasInput,
      });

      setProfile(prev => prev ? { ...prev, reservedAlias: reservedAliasInput } : null);

      toast({
        title: "Alias Reserved!",
        description: `Your new global alias is now ${reservedAliasInput}.`,
      });
    } catch (error) {
       toast({
        variant: "destructive",
        title: "Reservation Failed",
        description: "There was an error reserving your alias. It might already be taken."
      });
    } finally {
      setIsSavingAlias(false);
    }
  };

  if (isLoading) {
    return (
        <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-height,4rem)-2rem)]">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
    );
  }

  if (!profile) {
     return (
        <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-height,4rem)-2rem)]">
            <p className="text-muted-foreground">Could not load user profile.</p>
        </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto w-full overflow-hidden">
      <header className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-normal text-foreground font-mono">Settings</h1>
        <p className="text-base sm:text-lg text-muted-foreground mt-1">
          Manage your account, identity, preferences, and privacy.
        </p>
      </header>

      {/* Email Verification Advisory Banner */}
      {profile && !profile.emailVerified && !verifyBannerDismissed && (
        <div className="relative flex items-start gap-3 p-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Your email hasn&apos;t been verified yet.
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Verify your email to enable account recovery and notification emails.
            </p>
            <div className="mt-3 flex items-center gap-2">
              {verificationSent ? (
                <p className="text-xs text-green-700 dark:text-green-400 font-medium flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" /> Verification email sent! Check your inbox.
                </p>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-400 text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/50 h-8 text-xs"
                  disabled={isResendingVerification}
                  onClick={async () => {
                    if (!profile) return;
                    setIsResendingVerification(true);
                    try {
                      await resendVerificationEmail(profile.id);
                      setVerificationSent(true);
                      toast({ title: 'Email Sent', description: 'Check your inbox for the verification link.' });
                    } catch (err: unknown) {
                      toast({ variant: 'destructive', title: 'Error', description: ((err instanceof Error) ? err.message : 'An error occurred') });
                    } finally {
                      setIsResendingVerification(false);
                    }
                  }}
                >
                  {isResendingVerification ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Mail className="mr-1 h-3 w-3" />}
                  Resend Verification Email
                </Button>
              )}
            </div>
          </div>
          <button
            onClick={() => setVerifyBannerDismissed(true)}
            className="text-amber-500 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-200"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Identity & Profile Settings — stays inline due to tight state coupling */}
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <UserCircle className="h-7 w-7 text-primary" />
            <CardTitle className="text-xl">Identity &amp; Profile</CardTitle>
          </div>
          <CardDescription>Update your personal details and manage how you appear on the platform.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <Avatar className="h-20 w-20 shrink-0">
              <AvatarImage src={profile.avatar} alt={profile.name} data-ai-hint="profile person" />
              <AvatarFallback>{profile.name.split(" ").map(n => n[0]).join("")}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-2">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !profile) return;
                  setIsUploadingAvatar(true);
                  try {
                    const url = await uploadFile(file, 'avatars', 'avatar');
                    await updateUserProfile(profile.id, { avatar: url });
                    setProfile({ ...profile, avatar: url });
                    toast({ title: 'Avatar updated', description: 'Your profile picture has been changed.' });
                  } catch (err: unknown) {
                    toast({ variant: 'destructive', title: 'Upload failed', description: ((err instanceof Error) ? err.message : 'An error occurred') });
                  } finally {
                    setIsUploadingAvatar(false);
                  }
                }}
              />
              <Button variant="outline" disabled={isUploadingAvatar} onClick={() => avatarInputRef.current?.click()}>
                {isUploadingAvatar ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading...</> : 'Change Picture'}
              </Button>
            </div>
          </div>
           <div className="space-y-1.5">
              <Label htmlFor="givenName">Given Name</Label>
              <Input id="givenName" value={givenName} onChange={(e) => setGivenName(e.target.value)} />
              <p className="text-xs text-muted-foreground">This is your main profile name.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" type="email" value={profile.email} disabled />
            </div>
          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio</Label>
            <Input id="bio" placeholder="Tell us a little about yourself" value={bio} onChange={(e) => setBio(e.target.value)} />
          </div>
          
          <Separator />
          
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <Star className="h-6 w-6 text-primary" />
              <div>
                <h3 className="text-base font-semibold">Reserved Alias</h3>
                <p className="text-sm text-muted-foreground">Your unique, global handle across Tribes.app.</p>
              </div>
            </div>
             {role === 'Human_Free' ? (
                <div className="p-4 rounded-lg bg-muted/50 border border-dashed">
                    <h4 className="font-semibold text-foreground">Claim Your Global Alias</h4>
                    <p className="text-sm text-muted-foreground mt-1 mb-3">Upgrade to an Individual Co-op Membership to reserve your unique @handle and unlock more features.</p>
                    <Link href="/billing" passHref>
                        <Button variant="default">
                            <CreditCard className="mr-2 h-4 w-4" /> View Plans
                        </Button>
                    </Link>
                </div>
            ) : (
                 <div className="space-y-1.5 pl-0 sm:pl-9">
                    <Label htmlFor="reservedAlias">Your Global Alias</Label>
                    <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                        id="reservedAlias"
                        value={reservedAliasInput}
                        onChange={(e) => setReservedAliasInput(e.target.value)}
                        placeholder="@your-unique-name"
                        className="flex-1"
                    />
                     <Button onClick={handleReserveAlias} disabled={isSavingAlias || reservedAliasInput === (profile?.reservedAlias || '')} className="shrink-0">
                        {isSavingAlias ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                        Save
                    </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Must be unique and start with &apos;@&apos;.</p>
                </div>
            )}
          </div>

           <Separator />

            <div className="space-y-4">
                <div>
                    <h3 className="text-base font-semibold">Your Aliases</h3>
                    <p className="text-sm text-muted-foreground">Manage alternate names you can use within specific tribes.</p>
                </div>
                {aliases.length > 0 && (
                    <div className="space-y-2">
                        {aliases.map((alias, index) => (
                            <div key={index} className="flex items-center justify-between p-2 border rounded-md bg-muted/50">
                                <p className="text-sm font-medium flex items-center">
                                  <AtSign className="mr-2 h-4 w-4 text-muted-foreground"/> {alias}
                                </p>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemoveAlias(alias)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex flex-col sm:flex-row gap-2">
                    <Input 
                        id="new-alias" 
                        placeholder="Add a new alias..." 
                        value={newAlias}
                        onChange={(e) => setNewAlias(e.target.value)}
                        onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleAddAlias(); } }}
                        className="flex-1"
                    />
                    <Button type="button" onClick={handleAddAlias} disabled={!newAlias.trim()} className="shrink-0">
                        <PlusCircle className="h-4 w-4 mr-2"/> Add
                    </Button>
                </div>
            </div>
        </CardContent>
        <CardFooter>
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={handleSaveChanges} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
            {isSaving ? "Saving..." : "Save Profile Changes"}
          </Button>
        </CardFooter>
      </Card>

      <Separator />
      <ReputationSection profile={profile} />

      <Separator />
      <NotificationsSection
        notifPrefs={notifPrefs}
        setNotifPrefs={setNotifPrefs}
        isSaving={isSavingNotifPrefs}
        onSave={handleSaveNotifPrefs}
      />

      <Separator />
      <SecuritySection
        passkeys={passkeys}
        totpEnabled={userTotpEnabled}
        aiDataSharingEnabled={userAiSharing}
        onPasskeysChanged={loadPasskeys}
      />

      <Separator />
      <SessionsSection
        sessions={activeSessions}
        isLoading={isLoadingSessions}
        isRevokingSession={isRevokingSession}
        onRevoke={handleRevokeSession}
        onRevokeAll={handleRevokeAllOther}
      />

      <Separator />
      <AppearanceSection />

      {profile.role === 'Admin' && (
        <>
          <Separator />
          <div className="space-y-6">
            <header>
              <h2 className="text-2xl font-bold tracking-normal font-mono text-foreground flex items-center gap-2">
                <Cpu className="h-6 w-6 text-primary" /> AI Inference Engine
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Configure the LLM backend for T-Codex Prime and automated workflows.
              </p>
            </header>
            <AiSettingsSection />
          </div>
        </>
      )}

      <Separator />
      <BillingSection roleName={profile.role} hasActiveSubscription={profile.role !== 'Human_Free'} />

      <Separator />
      <AccountActionsSection />
    </div>
  );
}
