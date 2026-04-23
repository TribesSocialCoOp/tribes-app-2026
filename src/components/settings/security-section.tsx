'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck, KeyRound, Fingerprint, Plus, Trash2, Loader2, QrCode, ShieldAlert,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

// ============================================================
// TYPES
// ============================================================

interface PasskeyInfo {
  id: string;
  createdAt: Date;
}

interface SecuritySectionProps {
  /** Current registered passkeys for this user */
  passkeys: PasskeyInfo[];
  /** Whether TOTP 2FA is currently enabled */
  totpEnabled: boolean;
  /** Whether AI data sharing is enabled */
  aiDataSharingEnabled: boolean;
  /** Callback when passkeys list changes */
  onPasskeysChanged?: () => void;
}

// ============================================================
// COMPONENT
// ============================================================

export function SecuritySection({
  passkeys,
  totpEnabled,
  aiDataSharingEnabled,
  onPasskeysChanged,
}: SecuritySectionProps) {
  const { toast } = useToast();

  // ── Passkey Management ────────────────────────────────────
  const [isAddingPasskey, setIsAddingPasskey] = useState(false);
  const [removingPasskeyId, setRemovingPasskeyId] = useState<string | null>(null);

  async function handleAddPasskey() {
    setIsAddingPasskey(true);
    try {
      const { startRegistration } = await import('@simplewebauthn/browser');
      const { startPasskeyRegistration, completePasskeyRegistration } = await import('@/lib/actions/auth-actions');
      const options = await startPasskeyRegistration();
      const attestation = await startRegistration({ optionsJSON: options });
      await completePasskeyRegistration(attestation);
      toast({ title: 'Passkey Added', description: 'Your new passkey has been registered successfully.' });
      onPasskeysChanged?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add passkey.';
      if (!message.includes('cancelled') && !message.includes('AbortError')) {
        toast({ variant: 'destructive', title: 'Error', description: message });
      }
    } finally {
      setIsAddingPasskey(false);
    }
  }

  async function handleRemovePasskey(credentialId: string) {
    if (passkeys.length <= 1) {
      toast({ variant: 'destructive', title: 'Cannot Remove', description: 'You must keep at least one passkey for account access.' });
      return;
    }
    setRemovingPasskeyId(credentialId);
    try {
      const { removePasskey } = await import('@/lib/actions/auth-actions');
      await removePasskey(credentialId);
      toast({ title: 'Passkey Removed', description: 'The passkey has been removed from your account.' });
      onPasskeysChanged?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to remove passkey.';
      toast({ variant: 'destructive', title: 'Error', description: message });
    } finally {
      setRemovingPasskeyId(null);
    }
  }

  // ── TOTP 2FA ──────────────────────────────────────────────
  const [is2FADialogOpen, setIs2FADialogOpen] = useState(false);
  const [totpSetupData, setTotpSetupData] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [totpVerifyCode, setTotpVerifyCode] = useState('');
  const [isTogglingTotp, setIsTogglingTotp] = useState(false);

  async function handleSetup2FA() {
    setIsTogglingTotp(true);
    try {
      const { startTotpSetup } = await import('@/lib/actions/auth-actions');
      const data = await startTotpSetup();
      setTotpSetupData(data);
      setIs2FADialogOpen(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start 2FA setup.';
      toast({ variant: 'destructive', title: 'Error', description: message });
    } finally {
      setIsTogglingTotp(false);
    }
  }

  async function handleVerifyAndEnable2FA() {
    if (totpVerifyCode.length !== 6) return;
    setIsTogglingTotp(true);
    try {
      const { confirmTotpSetup } = await import('@/lib/actions/auth-actions');
      await confirmTotpSetup(totpVerifyCode);
      toast({ title: '2FA Enabled', description: 'Two-factor authentication is now active on your account.' });
      setIs2FADialogOpen(false);
      setTotpSetupData(null);
      setTotpVerifyCode('');
      onPasskeysChanged?.(); // Refresh security state
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid code. Please try again.';
      toast({ variant: 'destructive', title: 'Verification Failed', description: message });
    } finally {
      setIsTogglingTotp(false);
    }
  }

  async function handleDisable2FA() {
    setIsTogglingTotp(true);
    try {
      const { disableTotp } = await import('@/lib/actions/auth-actions');
      await disableTotp();
      toast({ title: '2FA Disabled', description: 'Two-factor authentication has been removed.' });
      onPasskeysChanged?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to disable 2FA.';
      toast({ variant: 'destructive', title: 'Error', description: message });
    } finally {
      setIsTogglingTotp(false);
    }
  }

  // ── AI Data Sharing Toggle ────────────────────────────────
  const [aiSharing, setAiSharing] = useState(aiDataSharingEnabled);
  const [isSavingAi, setIsSavingAi] = useState(false);

  async function handleAiSharingToggle(enabled: boolean) {
    setAiSharing(enabled);
    setIsSavingAi(true);
    try {
      const { updateUserProfile } = await import('@/lib/actions/profile-actions');
      const { getCurrentUserId } = await import('@/lib/actions/shared');
      const userId = await getCurrentUserId();
      if (userId) {
        await updateUserProfile(userId, { aiDataSharingEnabled: enabled } as any);
      }
    } catch {
      setAiSharing(!enabled); // Revert on failure
    } finally {
      setIsSavingAi(false);
    }
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center space-x-3">
          <ShieldCheck className="h-7 w-7 text-primary" />
          <CardTitle className="text-xl">Security &amp; Privacy</CardTitle>
        </div>
        <CardDescription>Manage your passkeys, two-factor authentication, and privacy settings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* ── Passkey Management ──────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <Fingerprint className="h-4 w-4" /> Passkeys
            </Label>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddPasskey}
              disabled={isAddingPasskey}
            >
              {isAddingPasskey ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
              Add Passkey
            </Button>
          </div>

          {passkeys.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No passkeys registered.</p>
          ) : (
            <div className="space-y-2">
              {passkeys.map((pk) => (
                <div key={pk.id} className="flex items-center justify-between gap-3 p-3 rounded-md border bg-muted/30">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate font-mono text-xs">{pk.id.substring(0, 16)}…</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Added {pk.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                    onClick={() => handleRemovePasskey(pk.id)}
                    disabled={removingPasskeyId === pk.id || passkeys.length <= 1}
                    title={passkeys.length <= 1 ? 'Must keep at least one passkey' : 'Remove passkey'}
                  >
                    {removingPasskeyId === pk.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Two-Factor Authentication ───────────────────── */}
        <div className="space-y-3 pt-2 border-t">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-semibold flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" /> Two-Factor Authentication
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Add an extra layer of security with a TOTP authenticator app.
              </p>
            </div>
            {totpEnabled ? (
              <Badge variant="default" className="bg-green-600 text-white">Enabled</Badge>
            ) : (
              <Badge variant="outline">Disabled</Badge>
            )}
          </div>

          {totpEnabled ? (
            <Button
              variant="outline"
              className="text-destructive border-destructive hover:bg-destructive/10"
              onClick={handleDisable2FA}
              disabled={isTogglingTotp}
            >
              {isTogglingTotp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Disable 2FA
            </Button>
          ) : (
            <Dialog open={is2FADialogOpen} onOpenChange={setIs2FADialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" onClick={handleSetup2FA} disabled={isTogglingTotp}>
                  {isTogglingTotp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
                  Setup 2FA
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Setup Two-Factor Authentication</DialogTitle>
                  <DialogDescription>
                    Scan this QR code with your authenticator app (Google Authenticator, 1Password, Authy, etc.)
                  </DialogDescription>
                </DialogHeader>
                {totpSetupData && (
                  <div className="space-y-4">
                    <div className="flex justify-center p-4 bg-white rounded-lg">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={totpSetupData.qrDataUrl} alt="TOTP QR Code" className="w-48 h-48" />
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1">Or enter this secret manually:</p>
                      <code className="text-xs font-mono bg-muted p-1.5 rounded select-all break-all">
                        {totpSetupData.secret}
                      </code>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="totp-code">Verification Code</Label>
                      <Input
                        id="totp-code"
                        placeholder="000000"
                        maxLength={6}
                        value={totpVerifyCode}
                        onChange={(e) => setTotpVerifyCode(e.target.value.replace(/\D/g, ''))}
                        className="text-center font-mono text-lg tracking-[0.5em]"
                        autoComplete="one-time-code"
                      />
                    </div>
                  </div>
                )}
                <DialogFooter>
                  <Button
                    onClick={handleVerifyAndEnable2FA}
                    disabled={totpVerifyCode.length !== 6 || isTogglingTotp}
                  >
                    {isTogglingTotp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Verify &amp; Enable
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* ── AI Data Sharing ────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 p-3 rounded-md border hover:bg-muted/50 border-t">
          <div className="min-w-0 flex-1">
            <Label htmlFor="dataSharing" className="font-medium">Allow AI Assistant Access to My Data</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Let the AI assistant use your public tribe information to provide more personalized help. Private data is never used.
            </p>
          </div>
          <Switch
            id="dataSharing"
            className="shrink-0"
            checked={aiSharing}
            onCheckedChange={handleAiSharingToggle}
            disabled={isSavingAi}
          />
        </div>

      </CardContent>
    </Card>
  );
}
