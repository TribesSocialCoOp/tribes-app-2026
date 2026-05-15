'use client';

/**
 * Vault Backup & Recovery section for Settings page.
 * 
 * Lets users create an encrypted backup of their bond E2E keys,
 * restore keys on a new device via password or passkey (PRF),
 * and manage their recovery credentials.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  ShieldCheck, Loader2, Download, Upload, KeyRound, CheckCircle2,
  AlertTriangle, Eye, EyeOff, HardDrive, RefreshCw, Fingerprint,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";

// ============================================================
// PASSPHRASE ENTROPY VALIDATION
// ============================================================

/**
 * Minimum passphrase requirements for vault encryption.
 * Combined with 600,000 PBKDF2 iterations this provides strong resistance
 * against offline brute-force attacks.
 */
const MIN_PASSPHRASE_LENGTH = 12;

interface PassphraseCheck {
  label: string;
  met: boolean;
}

function getPassphraseChecks(pass: string): PassphraseCheck[] {
  return [
    { label: `At least ${MIN_PASSPHRASE_LENGTH} characters`, met: pass.length >= MIN_PASSPHRASE_LENGTH },
    { label: 'Contains an uppercase letter', met: /[A-Z]/.test(pass) },
    { label: 'Contains a number or symbol', met: /[0-9]/.test(pass) || /[^A-Za-z0-9]/.test(pass) },
  ];
}

function isPassphraseStrong(pass: string): boolean {
  return getPassphraseChecks(pass).every(c => c.met);
}

function getStrengthScore(pass: string): number {
  let score = 0;
  if (pass.length >= MIN_PASSPHRASE_LENGTH) score += 30;
  if (pass.length >= 16) score += 10;
  if (/[A-Z]/.test(pass)) score += 20;
  if (/[a-z]/.test(pass)) score += 10;
  if (/[0-9]/.test(pass)) score += 15;
  if (/[^A-Za-z0-9]/.test(pass)) score += 15;
  return Math.min(100, score);
}

// ============================================================
// COMPONENT
// ============================================================

export const VaultBackupSection: React.FC = () => {
  const { toast } = useToast();
  const { user } = useUser();

  // State
  const [hasBackup, setHasBackup] = useState(false);
  const [backupDate, setBackupDate] = useState<Date | null>(null);
  const [localKeyCount, setLocalKeyCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Passkey PRF support
  const [prfSupported, setPrfSupported] = useState(false);
  const [hasPrfVault, setHasPrfVault] = useState(false);
  const [isPasskeyBacking, setIsPasskeyBacking] = useState(false);
  const [isPasskeyRestoring, setIsPasskeyRestoring] = useState(false);

  // Backup flow (password)
  const [showBackupForm, setShowBackupForm] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupProgress, setBackupProgress] = useState(0);

  // Restore flow (password)
  const [showRestoreForm, setShowRestoreForm] = useState(false);
  const [restorePassword, setRestorePassword] = useState('');
  const [showRestorePassword, setShowRestorePassword] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{ restored: number; total: number } | null>(null);

  // Refs for mobile keyboard scroll-into-view
  const backupFormRef = useRef<HTMLDivElement>(null);
  const restoreFormRef = useRef<HTMLDivElement>(null);

  // Passphrase strength
  const strengthScore = getStrengthScore(password);
  const strengthLabel = strengthScore < 40 ? 'Weak' : strengthScore < 70 ? 'Fair' : 'Strong';
  const strengthColor = strengthScore < 40 ? 'text-red-500' : strengthScore < 70 ? 'text-amber-500' : 'text-green-500';
  const passphraseChecks = getPassphraseChecks(password);
  const passphraseValid = isPassphraseStrong(password);

  // Load initial state
  useEffect(() => {
    async function loadState() {
      try {
        // Check PRF support
        try {
          const { isPrfSupported } = await import('@/lib/crypto/prf-vault');
          setPrfSupported(await isPrfSupported());
        } catch { /* PRF not available */ }

        // Check for PRF vault
        try {
          const { getVaultStatusAction } = await import('@/lib/actions/key-vault-actions');
          const status = await getVaultStatusAction();
          setHasPrfVault(status.devices.some(d => d.vaultType === 'prf'));
        } catch { /* No PRF vaults */ }

        // Check server for existing passphrase backup
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

  // Create backup (passphrase)
  const handleBackup = async () => {
    if (!passphraseValid) {
      toast({ variant: 'destructive', title: 'Passphrase too weak', description: 'Meet all the requirements shown below.' });
      return;
    }
    if (password !== passwordConfirm) {
      toast({ variant: 'destructive', title: 'Mismatch', description: 'Passphrases don\'t match.' });
      return;
    }

    setIsBackingUp(true);
    setBackupProgress(10);

    try {
      setBackupProgress(20);
      const { createVaultBackup, getIdentityKey } = await import('@/lib/crypto');
      const { importIdentityPublicKey } = await import('@/lib/crypto/identity-keys');
      
      let identityKeyParam: { privateKey: CryptoKey; publicKey: CryptoKey } | undefined;
      if (user?.id) {
        const identityEntry = await getIdentityKey(user.id);
        if (identityEntry) {
          const publicKey = await importIdentityPublicKey(identityEntry.publicKeyJwk);
          identityKeyParam = { privateKey: identityEntry.privateKey, publicKey };
        }
      }

      const { encryptedVault, salt } = await createVaultBackup(password, identityKeyParam);
      setBackupProgress(60);

      const encryptedVaultBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedVault)));
      setBackupProgress(70);

      const { saveVaultBackup } = await import('@/lib/actions/vault-actions');
      await saveVaultBackup(encryptedVaultBase64, salt);
      setBackupProgress(100);

      setHasBackup(true);
      setBackupDate(new Date());
      setShowBackupForm(false);
      setPassword('');
      setPasswordConfirm('');

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

  // Restore from backup (passphrase)
  const handleRestore = async () => {
    if (!restorePassword) {
      toast({ variant: 'destructive', title: 'Passphrase required', description: 'Enter your recovery passphrase.' });
      return;
    }

    setIsRestoring(true);

    try {
      const { getVaultBackup } = await import('@/lib/actions/vault-actions');
      const backup = await getVaultBackup();
      if (!backup) throw new Error('No backup found on server');

      const binaryStr = atob(backup.encryptedVaultBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const encryptedVault = bytes.buffer;

      const { restoreVaultBackup } = await import('@/lib/crypto');
      const result = await restoreVaultBackup(encryptedVault, backup.salt, restorePassword, user?.id);

      const { getAllBondKeyIds } = await import('@/lib/crypto');
      const ids = await getAllBondKeyIds();
      setLocalKeyCount(ids.length);

      setRestoreResult({ restored: result.imported, total: result.total });
      setShowRestoreForm(false);
      setRestorePassword('');

      const parts: string[] = [];
      if (result.imported > 0) parts.push(`${result.imported} new key${result.imported !== 1 ? 's' : ''} imported`);
      if (result.skipped > 0) parts.push(`${result.skipped} already on this device`);
      const description = parts.join(', ') || 'No new keys to import.';

      toast({
        title: result.imported > 0 ? 'Keys restored' : 'Keys already up to date',
        description,
      });
    } catch (err: unknown) {
      const message = (err instanceof Error) ? err.message : 'An error occurred';
      if (message.includes('Invalid passphrase') || message.includes('Invalid password')) {
        toast({ variant: 'destructive', title: 'Wrong passphrase', description: 'The passphrase doesn\'t match. Try again.' });
      } else {
        toast({ variant: 'destructive', title: 'Restore failed', description: message });
      }
    } finally {
      setIsRestoring(false);
    }
  };

  // Backup via passkey (PRF)
  const handlePasskeyBackup = async () => {
    setIsPasskeyBacking(true);
    try {
      const { authenticateWithPrf } = await import('@/lib/crypto/prf-webauthn-helpers');
      const { derivePrfWrappingKey, encryptVaultWithPrf } = await import('@/lib/crypto/prf-vault');

      const prfResult = await authenticateWithPrf();
      if (!prfResult) return; // cancelled

      const wrappingKey = await derivePrfWrappingKey(prfResult.prfOutput);
      const encryptedVault = await encryptVaultWithPrf(wrappingKey, user?.id);

      const encryptedVaultBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedVault)));

      const { savePrfVaultAction } = await import('@/lib/actions/key-vault-actions');
      await savePrfVaultAction(encryptedVaultBase64, prfResult.credentialId);

      setHasPrfVault(true);
      toast({ title: 'Passkey vault saved', description: 'Your keys are now synced to your passkey.' });
    } catch (err: unknown) {
      const message = (err instanceof Error) ? err.message : 'Passkey backup failed';
      if (!message.includes('cancelled') && !message.includes('AbortError')) {
        toast({ variant: 'destructive', title: 'Passkey backup failed', description: message });
      }
    } finally {
      setIsPasskeyBacking(false);
    }
  };

  // Restore via passkey (PRF)
  const handlePasskeyRestore = async () => {
    setIsPasskeyRestoring(true);
    try {
      const { authenticateWithPrf } = await import('@/lib/crypto/prf-webauthn-helpers');
      const { derivePrfWrappingKey, decryptAndRestoreVault } = await import('@/lib/crypto/prf-vault');

      const prfResult = await authenticateWithPrf();
      if (!prfResult) return;

      const wrappingKey = await derivePrfWrappingKey(prfResult.prfOutput);

      const { getPrfVaultAction } = await import('@/lib/actions/key-vault-actions');
      const vault = await getPrfVaultAction(prfResult.credentialId);
      if (!vault) {
        toast({ variant: 'destructive', title: 'No passkey vault', description: 'No vault backup is linked to this passkey yet.' });
        return;
      }

      const binaryStr = atob(vault.encryptedVaultBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      const result = await decryptAndRestoreVault(wrappingKey, bytes.buffer, user?.id);

      const { getAllBondKeyIds } = await import('@/lib/crypto');
      const ids = await getAllBondKeyIds();
      setLocalKeyCount(ids.length);

      toast({
        title: result.imported > 0 ? 'Keys synced!' : 'Already up to date',
        description: result.imported > 0
          ? `${result.imported} bond key${result.imported !== 1 ? 's' : ''} restored from your passkey vault.`
          : 'All keys are already on this device.',
      });
    } catch (err: unknown) {
      const message = (err instanceof Error) ? err.message : 'Passkey restore failed';
      if (!message.includes('cancelled') && !message.includes('AbortError')) {
        toast({ variant: 'destructive', title: 'Passkey sync failed', description: message });
      }
    } finally {
      setIsPasskeyRestoring(false);
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
    <Card id="vault" className="shadow-lg scroll-mt-24">
      <CardHeader>
        <div className="flex items-center space-x-3">
          <KeyRound className="h-7 w-7 text-primary" />
          <CardTitle className="text-xl">Key Vault &amp; Recovery</CardTitle>
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
              {(hasBackup || hasPrfVault)
                ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                : <AlertTriangle className="h-4 w-4 text-amber-500" />
              }
              Cloud Backup
            </div>
            <p className="text-2xl font-bold mt-1">{(hasBackup || hasPrfVault) ? 'Active' : 'None'}</p>
            <p className="text-xs text-muted-foreground">
              {hasBackup && backupDate
                ? `Passphrase: ${backupDate.toLocaleDateString()}`
                : hasPrfVault
                  ? 'Passkey vault active'
                  : 'Not yet backed up'}
            </p>
          </div>
        </div>

        {/* Warning for no backup */}
        {!hasBackup && !hasPrfVault && localKeyCount > 0 && (
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
            >
              {hasBackup
                ? <><RefreshCw className="mr-2 h-4 w-4" /> Update Backup</>
                : <><Download className="mr-2 h-4 w-4" /> Create Backup</>
              }
            </Button>
            {hasBackup && (
              <Button variant="outline" onClick={() => setShowRestoreForm(true)}>
                <Upload className="mr-2 h-4 w-4" /> Restore Keys
              </Button>
            )}
            {/* Passkey actions */}
            {prfSupported && (
              <>
                <Button
                  variant="outline"
                  onClick={handlePasskeyBackup}
                  disabled={isPasskeyBacking || localKeyCount === 0}
                >
                  {isPasskeyBacking
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                    : <><Fingerprint className="mr-2 h-4 w-4" /> {hasPrfVault ? 'Update Passkey Vault' : 'Back Up with Passkey'}</>
                  }
                </Button>
                {hasPrfVault && (
                  <Button
                    variant="outline"
                    onClick={handlePasskeyRestore}
                    disabled={isPasskeyRestoring}
                  >
                    {isPasskeyRestoring
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Syncing...</>
                      : <><Fingerprint className="mr-2 h-4 w-4" /> Restore with Passkey</>
                    }
                  </Button>
                )}
              </>
            )}
          </div>
        )}

        {/* Backup Form (Passphrase) */}
        {showBackupForm && (
          <div ref={backupFormRef} className="space-y-4 p-4 rounded-lg border bg-background">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Set Recovery Passphrase</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Choose a strong passphrase you&apos;ll remember. It&apos;s used to encrypt your keys before
              they leave this browser. We can&apos;t recover it for you.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="vault-password">Passphrase</Label>
              <div className="relative">
                <Input
                  id="vault-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter a strong passphrase"
                  className="pr-10"
                  onFocus={() => {
                    setTimeout(() => {
                      backupFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 350);
                  }}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {password.length > 0 && (
                <>
                  <div className="flex items-center gap-2 mt-1">
                    <Progress value={strengthScore} className="h-1.5 flex-1" />
                    <span className={`text-xs font-medium ${strengthColor}`}>{strengthLabel}</span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {passphraseChecks.map((check) => (
                      <li key={check.label} className={`text-xs flex items-center gap-1.5 ${check.met ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                        {check.met ? <CheckCircle2 className="h-3 w-3" /> : <span className="h-3 w-3 rounded-full border border-muted-foreground/40 inline-block" />}
                        {check.label}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vault-password-confirm">Confirm Passphrase</Label>
              <Input
                id="vault-password-confirm"
                type={showPassword ? 'text' : 'password'}
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="Re-enter your passphrase"
                onFocus={() => {
                  setTimeout(() => {
                    backupFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 350);
                }}
              />
              {passwordConfirm.length > 0 && password !== passwordConfirm && (
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
                disabled={isBackingUp || !passphraseValid || password !== passwordConfirm}
              >
                {isBackingUp
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Encrypting...</>
                  : <><ShieldCheck className="mr-2 h-4 w-4" /> Encrypt &amp; Save</>
                }
              </Button>
              <Button variant="ghost" onClick={() => { setShowBackupForm(false); setPassword(''); setPasswordConfirm(''); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Restore Form (Passphrase) */}
        {showRestoreForm && (
          <div ref={restoreFormRef} className="space-y-4 p-4 rounded-lg border bg-background">
            <div className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Restore Bond Keys</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Enter the passphrase you used when you created the backup. This will import your bond
              keys into this browser so you can read your encrypted conversations.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="vault-restore-password">Recovery Passphrase</Label>
              <div className="relative">
                <Input
                  id="vault-restore-password"
                  type={showRestorePassword ? 'text' : 'password'}
                  value={restorePassword}
                  onChange={(e) => setRestorePassword(e.target.value)}
                  placeholder="Enter your recovery passphrase"
                  className="pr-10"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleRestore(); }}
                  onFocus={() => {
                    setTimeout(() => {
                      restoreFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 350);
                  }}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowRestorePassword(!showRestorePassword)}
                >
                  {showRestorePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleRestore} disabled={isRestoring || !restorePassword}>
                {isRestoring
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Decrypting...</>
                  : <><Upload className="mr-2 h-4 w-4" /> Restore Keys</>
                }
              </Button>
              <Button variant="ghost" onClick={() => { setShowRestoreForm(false); setRestorePassword(''); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Fine print */}
        <p className="text-xs text-muted-foreground">
          Your passphrase is stretched with PBKDF2 (600,000 iterations) before encrypting.
          The server stores only the encrypted blob. We never see your passphrase or your private keys.
          {prfSupported && ' Passkey vaults use hardware-backed PRF + HKDF key derivation.'}
        </p>
      </CardContent>
    </Card>
  );
};
