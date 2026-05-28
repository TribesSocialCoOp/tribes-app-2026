
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserAvatar } from "@/components/ui/user-avatar";
import { UserCircle, Loader2, PlusCircle, AtSign, X, Star, CreditCard, Mail, AlertTriangle, CheckCircle2, ScrollText, Check } from "lucide-react";
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
import { VaultBackupSection } from '@/components/settings/vault-backup-section';
import { AppearanceSection, BillingSection, AccountActionsSection } from '@/components/settings/minor-sections';
import { useScrollToHash } from '@/hooks/use-scroll-to-hash';
import { AuthGuard } from '@/components/providers/auth-guard';



export default function SettingsPage() {
  return (
    <AuthGuard message="Sign in to manage your account settings and privacy.">
      <SettingsContent />
    </AuthGuard>
  );
}

function SettingsContent() {
  const { toast } = useToast();
  const { role, user: sessionUser, isLoading: isUserLoading, refresh: refreshUser } = useUser();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Identity form state
  const [aliases, setAliases] = useState<import('@/lib/types').UserAlias[]>([]);
  const [newAlias, setNewAlias] = useState("");
  const [reservedAliasInput, setReservedAliasInput] = useState('');
  const [isSavingAlias, setIsSavingAlias] = useState(false);
  const [isUploadingReservedAliasAvatar, setIsUploadingReservedAliasAvatar] = useState(false);
  const reservedAliasAvatarRef = React.useRef<HTMLInputElement>(null);


  // Email verification banner state
  const [verifyBannerDismissed, setVerifyBannerDismissed] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  // Notification preferences state
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefsState>({
    pushEnabled: true, emailEnabled: true, mentionsEnabled: true,
    bondMessagesEnabled: true, tribeActivityEnabled: true, eventRemindersEnabled: true,
    governanceEnabled: true,
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
        setAliases(userProfile.aliases || []);
        setReservedAliasInput(userProfile.reservedAlias || "");
        setUserTotpEnabled(userProfile.totpEnabled ?? false);
      }

      setIsLoading(false);
    };
    if (!isUserLoading) {
        fetchProfile();
    }
  }, [sessionUser, isUserLoading]);



  // Scroll to hash fragment (e.g. /settings#vault) after page loads
  useScrollToHash([isLoading, !!profile]);
  
  // ── Alias auto-persist helper ────────────────────────────────
  const persistAliases = useCallback(async (newAliases: import('@/lib/types').UserAlias[]) => {
    if (!profile) return;
    try {
      const result = await updateUserProfile(profile.id, { aliases: newAliases });
      if (result.success) {
        setProfile(result.profile);
        setAliases(result.profile.aliases || []);
        refreshUser();
      } else {
        toast({ variant: 'destructive', title: 'Save failed', description: result.error });
      }
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Error', description: ((err instanceof Error) ? err.message : 'An error occurred') });
    }
  }, [profile, refreshUser, toast]);

  const handleAddAlias = async () => {
    const trimmed = newAlias.trim();
    if (!trimmed) return;
    if (aliases.find(a => a.name === trimmed)) return;

    // Client-side collision hint: check against own reserved alias
    const bareReserved = profile?.reservedAlias?.replace(/^@/, '').toLowerCase();
    if (bareReserved && trimmed.toLowerCase() === bareReserved) {
      toast({
        variant: 'destructive',
        title: 'Redundant Alias',
        description: `"${trimmed}" matches your reserved handle ${profile?.reservedAlias}. Use your reserved alias instead.`,
      });
      return;
    }

    const { avatarSvg } = require('@/lib/placeholder-svg');
    const updated = [...aliases, { name: trimmed, avatar: avatarSvg(trimmed) }];
    setAliases(updated);
    setNewAlias("");
    await persistAliases(updated);
  };

  const handleRemoveAlias = async (aliasName: string) => {
    const updated = aliases.filter(a => a.name !== aliasName);
    setAliases(updated);
    await persistAliases(updated);
  };

  const [isUploadingAliasAvatar, setIsUploadingAliasAvatar] = useState<number | null>(null);

  const handleAliasAvatarUpload = async (index: number, file: File) => {
    if (!profile) return;
    setIsUploadingAliasAvatar(index);
    try {
      const { normalizeImage } = await import('@/lib/image-utils');
      const normalizedFile = await normalizeImage(file);
      const url = await uploadFile(normalizedFile, 'avatars', 'avatar');
      const newAliases = [...aliases];
      newAliases[index] = { ...newAliases[index]!, avatar: url };
      setAliases(newAliases);
      // Auto-save alias avatar to database immediately
      const result = await updateUserProfile(profile.id, {
        aliases: newAliases,
      });
      if (result.success) {
        setProfile(result.profile);
        refreshUser();
        toast({ title: 'Alias avatar updated', description: 'Your alias picture has been saved.' });
      } else {
        toast({ variant: 'destructive', title: 'Save failed', description: result.error });
      }
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Upload failed', description: ((err instanceof Error) ? err.message : 'An error occurred') });
    } finally {
      setIsUploadingAliasAvatar(null);
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
    
    const result = await updateUserProfile(profile.id, {
      reservedAlias: reservedAliasInput,
    });

    if (result.success) {
      setProfile(prev => prev ? { ...prev, reservedAlias: reservedAliasInput } : null);
      toast({
        title: "Alias Reserved!",
        description: `Your new global alias is now ${reservedAliasInput}.`,
      });
    } else {
      toast({
        variant: "destructive",
        title: "Reservation Failed",
        description: result.error,
      });
    }
    setIsSavingAlias(false);
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

      {/* Billing & Subscription — first section for membership visibility */}
      <BillingSection roleName={profile.role} hasActiveSubscription={profile.role !== 'Human_Free'} />

      <Separator />

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
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 shrink-0 border-2 border-primary/20">
              <AvatarImage src={profile.avatar} alt={profile.name} />
              <AvatarFallback>{profile.name.split(" ").map(n => n[0]).join("")}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="text-lg font-semibold">{profile.name}</p>
              <p className="text-sm text-muted-foreground line-clamp-1">{profile.bio || "No bio set."}</p>
              <Link href="/my-wall" className="text-xs text-primary hover:underline flex items-center gap-1 mt-1">
                Edit identity on My Wall <ScrollText className="h-3 w-3" />
              </Link>
            </div>
          </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="email">Email Address</Label>
                {profile.emailVerified ? (
                  <span className="text-xs font-medium text-green-600 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Verified
                  </span>
                ) : (
                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Unverified
                  </span>
                )}
              </div>
              <Input id="email" type="email" value={profile.email} disabled />
            </div>

          
          <Separator />
          
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <Star className="h-6 w-6 text-primary" />
              <div>
                <h3 className="text-base font-semibold">Reserved Alias</h3>
                <p className="text-sm text-muted-foreground">Your unique, global handle across Tribes.</p>
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
                 <div className="space-y-4 pl-0 sm:pl-9">
                    {/* Reserved alias avatar */}
                    {profile.reservedAlias && (
                      <div className="flex items-center gap-4">
                        <Avatar className="h-16 w-16 shrink-0 border-2 border-primary/20">
                          <AvatarImage src={profile.reservedAliasAvatar} alt={profile.reservedAlias} />
                          <AvatarFallback className="text-sm font-bold">{(profile.reservedAlias.replace('@', '')).substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col gap-1">
                          <p className="text-sm font-medium">{profile.reservedAlias}</p>
                          <input
                            ref={reservedAliasAvatarRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file || !profile) return;
                              setIsUploadingReservedAliasAvatar(true);
                              try {
                                const { normalizeImage } = await import('@/lib/image-utils');
                                const normalizedFile = await normalizeImage(file);
                                const url = await uploadFile(normalizedFile, 'avatars', 'avatar');
                                const result = await updateUserProfile(profile.id, { reservedAliasAvatar: url });
                                if (result.success) {
                                  setProfile(result.profile);
                                  refreshUser();
                                  toast({ title: 'Alias avatar updated', description: `Avatar for ${profile.reservedAlias} has been saved.` });
                                } else {
                                  toast({ variant: 'destructive', title: 'Save failed', description: result.error });
                                }
                              } catch (err: unknown) {
                                toast({ variant: 'destructive', title: 'Upload failed', description: ((err instanceof Error) ? err.message : 'An error occurred') });
                              } finally {
                                setIsUploadingReservedAliasAvatar(false);
                              }
                            }}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isUploadingReservedAliasAvatar}
                            onClick={() => reservedAliasAvatarRef.current?.click()}
                          >
                            {isUploadingReservedAliasAvatar ? <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" />Uploading...</> : 'Change Picture'}
                          </Button>
                        </div>
                      </div>
                    )}
                    <div className="space-y-1.5">
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
                </div>
            )}
          </div>

           <Separator />

            <div className="space-y-4">
                <div>
                    <h3 className="text-base font-semibold">Your Aliases</h3>
                    <p className="text-sm text-muted-foreground">Manage alternate names and pictures you can use within specific tribes.</p>
                </div>
                {aliases.length > 0 && (
                    <div className="space-y-3">
                        {aliases.map((alias, index) => (
                            <div key={index} className="flex items-center gap-3 p-3 border rounded-md bg-muted/30">
                                <UserAvatar 
                                  user={{ name: alias.name, avatar: alias.avatar }} 
                                  className="h-10 w-10 rounded-md shrink-0 border"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate flex items-center">
                                    <AtSign className="mr-1.5 h-3.5 w-3.5 text-muted-foreground"/> {alias.name}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <input
                                      id={`alias-avatar-${index}`}
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleAliasAvatarUpload(index, file);
                                      }}
                                    />
                                    <Button 
                                      variant="link" 
                                      size="sm" 
                                      className="h-auto p-0 text-xs text-primary"
                                      disabled={isUploadingAliasAvatar !== null}
                                      onClick={() => document.getElementById(`alias-avatar-${index}`)?.click()}
                                    >
                                      {isUploadingAliasAvatar === index ? 'Uploading...' : 'Change Picture'}
                                    </Button>
                                  </div>
                                </div>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleRemoveAlias(alias.name)}>
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
        onPasskeysChanged={loadPasskeys}
      />

      <Separator />
      <VaultBackupSection />

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

      <Separator />

      {/* ── Legal ── */}
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <ScrollText className="h-7 w-7 text-primary" />
            <CardTitle className="text-xl">Legal</CardTitle>
          </div>
          <CardDescription>
            Review the agreements and policies governing your use of Tribes.app.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link href="/terms" className="group flex items-center gap-2 p-3 rounded-md border hover:border-primary/40 hover:bg-primary/5 transition-colors">
            <ScrollText className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="text-sm font-medium">Terms of Service</span>
          </Link>
          <Link href="/privacy" className="group flex items-center gap-2 p-3 rounded-md border hover:border-primary/40 hover:bg-primary/5 transition-colors">
            <ScrollText className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="text-sm font-medium">Privacy Policy</span>
          </Link>
          <Link href="/community-guidelines" className="group flex items-center gap-2 p-3 rounded-md border hover:border-primary/40 hover:bg-primary/5 transition-colors">
            <ScrollText className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="text-sm font-medium">Community Guidelines</span>
          </Link>
          <Link href="/cookies" className="group flex items-center gap-2 p-3 rounded-md border hover:border-primary/40 hover:bg-primary/5 transition-colors">
            <ScrollText className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="text-sm font-medium">Cookie Policy</span>
          </Link>
          <Link href="/report-ncii" className="group flex items-center gap-2 p-3 rounded-md border hover:border-primary/40 hover:bg-primary/5 transition-colors col-span-1 sm:col-span-2">
            <ScrollText className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="text-sm font-semibold text-foreground">Report NCII Secure Portal</span>
          </Link>
        </CardContent>
      </Card>

      <Separator />
      <AccountActionsSection />
    </div>
  );
}
