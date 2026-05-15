'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CreditCard, LogOut, Palette, Trash2, Loader2, ShieldAlert, KeyRound } from "lucide-react";
import { useTheme } from '@/hooks/use-theme';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { logoutAction } from "@/lib/auth-actions";
import { startReauthChallenge, verifyReauthChallenge } from "@/lib/actions/auth-actions";
import { deleteMyAccount } from "@/lib/actions/profile-actions";
import { startAuthentication } from '@simplewebauthn/browser';

export function AppearanceSection() {
  const { isDark, toggle } = useTheme();

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center space-x-3">
          <Palette className="h-7 w-7 text-primary" />
          <CardTitle className="text-xl">Appearance</CardTitle>
        </div>
        <CardDescription>Customize the look and feel of Tribes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3 p-3 rounded-md border hover:bg-muted/50">
          <Label htmlFor="darkMode" className="flex-1 cursor-pointer">Dark Mode</Label>
          <Switch id="darkMode" className="shrink-0" checked={isDark} onCheckedChange={toggle} />
        </div>
      </CardContent>
    </Card>
  );
}

interface BillingSectionProps {
  roleName: string;
  hasActiveSubscription?: boolean;
}

export function BillingSection({ roleName, hasActiveSubscription }: BillingSectionProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);

  // Lazy-check platform to avoid SSR issues
  const [canUseStripe, setCanUseStripe] = useState(true);
  React.useEffect(() => {
    import('@/lib/services/storekit-service').then(m => setCanUseStripe(m.allowsStripe()));
  }, []);

  async function handleManageSubscription() {
    setIsLoadingPortal(true);
    try {
      const { createBillingPortalAction } = await import('@/lib/actions/profile-actions');
      const result = await createBillingPortalAction();
      if (result?.url) {
        router.push(result.url);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not open billing portal.';
      toast({ variant: 'destructive', title: 'Billing Error', description: message });
    } finally {
      setIsLoadingPortal(false);
    }
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center space-x-3">
          <CreditCard className="h-7 w-7 text-primary" />
          <CardTitle className="text-xl">Billing &amp; Subscription</CardTitle>
        </div>
        <CardDescription>Manage your subscription plan and payment methods.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground">Current Plan: <span className="font-semibold text-foreground">{roleName.replace(/_/g, ' ')}</span></p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="default"
            className="bg-accent text-accent-foreground hover:bg-accent/90 w-full sm:w-auto"
            onClick={() => router.push('/billing')}
          >
            <CreditCard className="mr-2 h-4 w-4" /> View Plans & Upgrade
          </Button>
          {hasActiveSubscription && canUseStripe && (
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={handleManageSubscription}
              disabled={isLoadingPortal}
            >
              {isLoadingPortal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Manage Subscription
            </Button>
          )}
          {hasActiveSubscription && !canUseStripe && (
            <p className="text-sm text-muted-foreground italic self-center">
              Manage via Apple ID Settings
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

type DeletionStep = 'idle' | 'confirming' | 'reauth' | 'reauth-waiting' | 'deleting' | 'done';

export function AccountActionsSection() {
  const { toast } = useToast();
  const router = useRouter();
  const [step, setStep] = useState<DeletionStep>('idle');
  const [confirmText, setConfirmText] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logoutAction();
      router.push('/login');
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to log out.' });
      setIsLoggingOut(false);
    }
  }

  async function handleStartPasskeyReauth() {
    setStep('reauth');
    try {
      // Get challenge from server
      const options = await startReauthChallenge();
      setStep('reauth-waiting');

      // Trigger browser passkey prompt
      const authResponse = await startAuthentication({ optionsJSON: options });

      // Verify on server
      const verified = await verifyReauthChallenge(authResponse);

      if (verified) {
        setStep('deleting');
        await performDeletion();
      } else {
        toast({ variant: 'destructive', title: 'Verification Failed', description: 'Passkey verification failed. Please try again.' });
        setStep('confirming');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Passkey authentication was cancelled or failed.';
      toast({ variant: 'destructive', title: 'Authentication Error', description: message });
      setStep('confirming');
    }
  }

  async function performDeletion() {
    try {
      const result = await deleteMyAccount();
      setStep('done');
      const date = new Date(result.scheduledDate).toLocaleDateString();
      toast({ title: 'Deletion Scheduled', description: `Your account will be permanently deleted on ${date}. You can cancel by logging back in.` });
      // Redirect after a brief pause
      setTimeout(() => router.push('/login'), 2500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete account.';
      toast({ variant: 'destructive', title: 'Deletion Failed', description: message });
      setStep('confirming');
    }
  }

  function resetDialog() {
    setStep('idle');
    setConfirmText('');
    setDialogOpen(false);
  }

  const isProcessing = step === 'reauth' || step === 'reauth-waiting' || step === 'deleting';

  return (
    <Card className="shadow-lg border-destructive">
      <CardHeader>
        <CardTitle className="text-xl text-destructive">Account Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          variant="outline"
          className="w-full text-destructive border-destructive hover:bg-destructive/10"
          onClick={handleLogout}
          disabled={isLoggingOut}
        >
          {isLoggingOut ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <LogOut className="mr-2 h-5 w-5" />}
          {isLoggingOut ? 'Logging out...' : 'Log Out'}
        </Button>

        <AlertDialog open={dialogOpen} onOpenChange={(open) => { if (!isProcessing) { setDialogOpen(open); if (!open) resetDialog(); } }}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="w-full" onClick={() => { setStep('confirming'); setDialogOpen(true); }}>
              <Trash2 className="mr-2 h-5 w-5" /> Delete Account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <ShieldAlert className="h-5 w-5" />
                Delete Your Account
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm">
                  <p>Your account will be <strong>scheduled for deletion</strong> with a <strong>30-day recovery window</strong>.</p>
                  <p className="text-muted-foreground">During the grace period:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Your account will be deactivated immediately</li>
                    <li>You can log back in within 30 days to cancel</li>
                    <li>Active subscriptions will be cancelled now</li>
                    <li>After 30 days, all data is permanently removed</li>
                  </ul>
                  <p className="text-muted-foreground">
                    Posts with replies from other users will be anonymized to preserve conversation threads.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>

            {step === 'confirming' && (
              <div className="space-y-3 pt-2">
                <Label htmlFor="confirm-delete" className="text-sm font-medium">
                  Type <span className="font-mono font-bold text-destructive">DELETE</span> to confirm:
                </Label>
                <Input
                  id="confirm-delete"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="font-mono"
                  autoComplete="off"
                />
              </div>
            )}

            {(step === 'reauth' || step === 'reauth-waiting') && (
              <div className="flex flex-col items-center gap-3 py-4">
                <KeyRound className="h-10 w-10 text-muted-foreground animate-pulse" />
                <p className="text-sm text-muted-foreground text-center">
                  {step === 'reauth' ? 'Preparing passkey challenge...' : 'Waiting for passkey verification...'}
                </p>
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {step === 'deleting' && (
              <div className="flex flex-col items-center gap-3 py-4">
                <Loader2 className="h-10 w-10 animate-spin text-destructive" />
                <p className="text-sm text-muted-foreground text-center">Deleting your account...</p>
              </div>
            )}

            {step === 'done' && (
              <div className="flex flex-col items-center gap-3 py-4">
                <p className="text-sm text-foreground text-center font-medium">Deletion scheduled. Redirecting to login...</p>
              </div>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={isProcessing} onClick={resetDialog}>
                Cancel
              </AlertDialogCancel>
              {step === 'confirming' && (
                <Button
                  variant="destructive"
                  disabled={confirmText !== 'DELETE'}
                  onClick={handleStartPasskeyReauth}
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  Verify &amp; Delete
                </Button>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
