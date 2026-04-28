'use client';

/**
 * Vault Backup & Recovery section for Settings page.
 * 
 * Lets users create an encrypted backup of their bond E2E keys,
 * restore keys on a new device, and manage their recovery passphrase.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  ShieldCheck, Loader2, Download, Upload, KeyRound, CheckCircle2,
  AlertTriangle, Eye, EyeOff, HardDrive, RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface VaultSectionProps {
  // No props needed — self-contained
}

export const VaultBackupSection: React.FC<VaultSectionProps> = () => {
  const { toast } = useToast();

  // State
  const [hasBackup, setHasBackup] = useState(false);
  const [backupDate, setBackupDate] = useState<Date | null>(null);
  const [localKeyCount, setLocalKeyCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Backup flow
  const [showBackupForm, setShowBackupForm] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [passphraseConfirm, setPassphraseConfirm] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupProgress, setBackupProgress] = useState(0);

  // Restore flow
  const [showRestoreForm, setShowRestoreForm] = useState(false);
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [showRestorePassphrase, setShowRestorePassphrase] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{ restored: number; total: number } | null>(null);

  // Passphrase strength
  const passphraseStrength = useCallback((pass: string) => {
    let score = 0;
    if (pass.length >= 8) score += 25;
    if (pass.length >= 12) score += 15;
    if (/[A-Z]/.test(pass)) score += 20;
    if (/[0-9]/.test(pass)) score += 20;
    if (/[^A-Za-z0-9]/.test(pass)) score += 20;
    return Math.min(100, score);
  }, []);

  const strengthScore = passphraseStrength(passphrase);
  const strengthLabel = strengthScore < 40 ? 'Weak' : strengthScore < 70 ? 'Fair' : 'Strong';
  const strengthColor = strengthScore < 40 ? 'text-red-500' : strengthScore < 70 ? 'text-amber-500' : 'text-green-500';

  // Load initial state
  useEffect(() => {
    async function loadState() {
      try {
        // Check server for existing backup
        const { hasVaultBackup } = await import('@/lib/actions/vault-actions');
        const exists = await hasVaultBackup();
        setHasBackup(exists);

        if (exists) {
          const { getVaultBackup } = await import('@/lib/actions/vault-actions');
          const backup = await getVaultBackup();
          if (backup?.createdAt) setBackupDate(backup.createdAt);
        }

        // Count local keys in IndexedDB
        if (typeof window !== 'undefined') {
          const { getAllBondKeyIds } = await import('@/lib/crypto');
          const ids = await getAllBondKeyIds();
          setLocalKeyCount(ids.length);
        }
      } catch (err) {
        console.error('[vault-section] Load error:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadState();
  }, []);

  // Create backup
  const handleBackup = async () => {
    if (passphrase.length < 8) {
      toast({ variant: 'destructive', title: 'Passphrase too short', description: 'Use at least 8 characters.' });
      return;
    }
    if (passphrase !== passphraseConfirm) {
      toast({ variant: 'destructive', title: 'Mismatch', description: 'Passphrases don\'t match.' });
      return;
    }

    setIsBackingUp(true);
    setBackupProgress(10);

    try {
      // Step 1: Create the encrypted vault (client-side)
      setBackupProgress(20);
      const { createVaultBackup } = await import('@/lib/crypto');
      const { encryptedVault, salt } = await createVaultBackup(passphrase);
      setBackupProgress(60);

      // Step 2: Convert to base64 for transport
      const encryptedVaultBase64 = btoa(
        String.fromCharCode(...new Uint8Array(encryptedVault))
      );
      setBackupProgress(70);

      // Step 3: Save to server
      const { saveVaultBackup } = await import('@/lib/actions/vault-actions');
      await saveVaultBackup(encryptedVaultBase64, salt);
      setBackupProgress(100);

      setHasBackup(true);
      setBackupDate(new Date());
      setShowBackupForm(false);
      setPassphrase('');
      setPassphraseConfirm('');

      toast({
        title: 'Vault backed up',
        description: `${localKeyCount} bond key${localKeyCount !== 1 ? 's' : ''} encrypted and saved.`,
      });
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Backup failed',
        description: (err instanceof Error) ? err.message : 'An error occurred',
      });
    } finally {
      setIsBackingUp(false);
      setBackupProgress(0);
    }
  };

  // Restore from backup
  const handleRestore = async () => {
    if (!restorePassphrase) {
      toast({ variant: 'destructive', title: 'Passphrase required', description: 'Enter your recovery passphrase.' });
      return;
    }

    setIsRestoring(true);

    try {
      // Step 1: Fetch encrypted vault from server
      const { getVaultBackup } = await import('@/lib/actions/vault-actions');
      const backup = await getVaultBackup();
      if (!backup) throw new Error('No backup found on server');

      // Step 2: Decode from base64
      const binaryStr = atob(backup.encryptedVaultBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const encryptedVault = bytes.buffer;

      // Step 3: Decrypt and import keys (client-side)
      const { restoreVaultBackup } = await import('@/lib/crypto');
      const restoredKeys = await restoreVaultBackup(encryptedVault, backup.salt, restorePassphrase);

      // Step 4: Update local key count
      const { getAllBondKeyIds } = await import('@/lib/crypto');
      const ids = await getAllBondKeyIds();
      setLocalKeyCount(ids.length);

      setRestoreResult({ restored: restoredKeys.size, total: restoredKeys.size });
      setShowRestoreForm(false);
      setRestorePassphrase('');

      toast({
        title: 'Keys restored',
        description: `${restoredKeys.size} bond key${restoredKeys.size !== 1 ? 's' : ''} imported to this device.`,
      });
    } catch (err: unknown) {
      const message = (err instanceof Error) ? err.message : 'An error occurred';
      if (message.includes('Invalid passphrase')) {
        toast({ variant: 'destructive', title: 'Wrong passphrase', description: 'The passphrase doesn\'t match. Try again.' });
      } else {
        toast({ variant: 'destructive', title: 'Restore failed', description: message });
      }
    } finally {
      setIsRestoring(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="shadow-lg">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center space-x-3">
          <KeyRound className="h-7 w-7 text-primary" />
          <CardTitle className="text-xl">Key Vault & Recovery</CardTitle>
        </div>
        <CardDescription>
          Back up your encrypted bond keys so you can recover them on a new device.
          Your passphrase never leaves this browser.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-muted/50 border">
            <div className="flex items-center gap-2 text-sm font-medium">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              Local Keys
            </div>
            <p className="text-2xl font-bold mt-1">{localKeyCount}</p>
            <p className="text-xs text-muted-foreground">bond keys on this device</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 border">
            <div className="flex items-center gap-2 text-sm font-medium">
              {hasBackup
                ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                : <AlertTriangle className="h-4 w-4 text-amber-500" />
              }
              Cloud Backup
            </div>
            <p className="text-2xl font-bold mt-1">{hasBackup ? 'Active' : 'None'}</p>
            <p className="text-xs text-muted-foreground">
              {hasBackup && backupDate
                ? `Last: ${backupDate.toLocaleDateString()}`
                : 'Not yet backed up'}
            </p>
          </div>
        </div>

        {/* Warning for no backup */}
        {!hasBackup && localKeyCount > 0 && (
          <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Your bond keys aren&apos;t backed up
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                If you clear your browser data or switch devices, you&apos;ll lose access to your
                encrypted conversations. Set up a recovery passphrase to protect against this.
              </p>
            </div>
          </div>
        )}

        {/* Restore result */}
        {restoreResult && (
          <div className="flex items-start gap-3 p-3 rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-700">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Restored {restoreResult.restored} bond key{restoreResult.restored !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                Your encrypted conversations should now be accessible on this device.
              </p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {!showBackupForm && !showRestoreForm && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="default"
              onClick={() => setShowBackupForm(true)}
              disabled={localKeyCount === 0}
            >
              {hasBackup
                ? <><RefreshCw className="mr-2 h-4 w-4" /> Update Backup</>
                : <><Download className="mr-2 h-4 w-4" /> Create Backup</>
              }
            </Button>
            {hasBackup && (
              <Button
                variant="outline"
                onClick={() => setShowRestoreForm(true)}
              >
                <Upload className="mr-2 h-4 w-4" /> Restore Keys
              </Button>
            )}
          </div>
        )}

        {/* Backup Form */}
        {showBackupForm && (
          <div className="space-y-4 p-4 rounded-lg border bg-background">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Set Recovery Passphrase</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Choose a strong passphrase you&apos;ll remember. It&apos;s used to encrypt your keys before they leave this
              browser. We can&apos;t recover it for you.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="vault-passphrase">Passphrase</Label>
              <div className="relative">
                <Input
                  id="vault-passphrase"
                  type={showPassphrase ? 'text' : 'password'}
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Enter a strong passphrase"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassphrase(!showPassphrase)}
                >
                  {showPassphrase ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {passphrase.length > 0 && (
                <div className="flex items-center gap-2 mt-1">
                  <Progress value={strengthScore} className="h-1.5 flex-1" />
                  <span className={`text-xs font-medium ${strengthColor}`}>{strengthLabel}</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vault-passphrase-confirm">Confirm Passphrase</Label>
              <Input
                id="vault-passphrase-confirm"
                type={showPassphrase ? 'text' : 'password'}
                value={passphraseConfirm}
                onChange={(e) => setPassphraseConfirm(e.target.value)}
                placeholder="Re-enter your passphrase"
              />
              {passphraseConfirm.length > 0 && passphrase !== passphraseConfirm && (
                <p className="text-xs text-red-500">Passphrases don&apos;t match</p>
              )}
            </div>

            {isBackingUp && (
              <div className="space-y-1">
                <Progress value={backupProgress} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">
                  {backupProgress < 30 ? 'Exporting keys...' :
                   backupProgress < 70 ? 'Encrypting vault...' :
                   backupProgress < 100 ? 'Saving to server...' : 'Done!'}
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleBackup}
                disabled={isBackingUp || passphrase.length < 8 || passphrase !== passphraseConfirm}
              >
                {isBackingUp
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Encrypting...</>
                  : <><ShieldCheck className="mr-2 h-4 w-4" /> Encrypt & Save</>
                }
              </Button>
              <Button variant="ghost" onClick={() => { setShowBackupForm(false); setPassphrase(''); setPassphraseConfirm(''); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Restore Form */}
        {showRestoreForm && (
          <div className="space-y-4 p-4 rounded-lg border bg-background">
            <div className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Restore Bond Keys</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Enter the passphrase you used when you created the backup. This will import your bond
              keys into this browser so you can read your encrypted conversations.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="vault-restore-passphrase">Recovery Passphrase</Label>
              <div className="relative">
                <Input
                  id="vault-restore-passphrase"
                  type={showRestorePassphrase ? 'text' : 'password'}
                  value={restorePassphrase}
                  onChange={(e) => setRestorePassphrase(e.target.value)}
                  placeholder="Enter your recovery passphrase"
                  className="pr-10"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleRestore(); }}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowRestorePassphrase(!showRestorePassphrase)}
                >
                  {showRestorePassphrase ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleRestore}
                disabled={isRestoring || !restorePassphrase}
              >
                {isRestoring
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Decrypting...</>
                  : <><Upload className="mr-2 h-4 w-4" /> Restore Keys</>
                }
              </Button>
              <Button variant="ghost" onClick={() => { setShowRestoreForm(false); setRestorePassphrase(''); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Fine print */}
        <p className="text-xs text-muted-foreground">
          Your passphrase is stretched with PBKDF2 (600,000 iterations) before encrypting.
          The server stores only the encrypted blob. We never see your passphrase or your private keys.
        </p>
      </CardContent>
    </Card>
  );
};
