'use client';

/**
 * @fileoverview Key Sync Banner — alert shown when orphaned bonds are detected.
 *
 * Orphaned bonds = bonds that have server-side public keys but no local private
 * key in IndexedDB. This means the user created those bonds on another device
 * and needs to sync keys to this one.
 *
 * The banner guides users through safe recovery (restore from vault) and buries
 * the destructive "reset keys" option behind clear warnings.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useKeySync } from './key-sync-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertTriangle, KeyRound, Upload, Fingerprint, ChevronDown, ChevronUp,
  Loader2, ShieldAlert, Eye, EyeOff, ShieldCheck, ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/hooks/use-user';
import { ResetKeysDialog } from '@/components/dialogs/reset-keys-dialog';

export function KeySyncBanner() {
  const {
    orphanedBondCount, orphanedBondNames, rekeyOrphanedBonds,
    initialSyncDone, newestOrphanDate, newestKeyDate,
  } = useKeySync();
  const { toast } = useToast();
  const { user } = useUser();

  const [dismissed, setDismissed] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isPasskeyRestoring, setIsPasskeyRestoring] = useState(false);
  const [prfSupported, setPrfSupported] = useState(false);

  // Inline passphrase restore state
  const [showPassphraseInput, setShowPassphraseInput] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const passphraseRef = useRef<HTMLDivElement>(null);

  // Vault backup date (to warn about stale backups)
  const [backupDate, setBackupDate] = useState<Date | null>(null);
  const [hasBackup, setHasBackup] = useState(false);
  const [hasPrfVault, setHasPrfVault] = useState(false);

  // Check PRF support on mount
  useEffect(() => {
    async function check() {
      try {
        const { isPrfSupported } = await import('@/lib/crypto/prf-vault');
        const supported = await isPrfSupported();
        console.log('[key-sync-banner] PRF supported:', supported);
        setPrfSupported(supported);
      } catch (err) {
        console.warn('[key-sync-banner] PRF check failed:', err);
        setPrfSupported(false);
      }
    }
    check();
  }, []);

  // Check backup date + PRF vault status on mount
  useEffect(() => {
    async function loadBackupInfo() {
      try {
        const { getVaultBackupDate } = await import('@/lib/actions/vault-actions');
        const date = await getVaultBackupDate();
        setBackupDate(date);
        setHasBackup(!!date);
      } catch { /* ignore */ }
      try {
        const { getVaultStatusAction } = await import('@/lib/actions/key-vault-actions');
        const status = await getVaultStatusAction();
        setHasPrfVault(status.devices.some(d => d.vaultType === 'prf'));
      } catch { /* ignore */ }
    }
    loadBackupInfo();
  }, []);

  // Determine if we need a backup (healthy keys but stale vault)
  const needsBackup = !orphanedBondCount && newestKeyDate && (!backupDate || backupDate < newestKeyDate);

  // Don't render if nothing to report, not yet synced, or dismissed
  if (!initialSyncDone || dismissed) return null;
  if (orphanedBondCount === 0 && !needsBackup) return null;

  // Variant 1: BACKUP REQUIRED (The device has the keys, but hasn't shared them with the vault)
  if (needsBackup) {
    return (
      <div className="mx-auto max-w-4xl w-full mb-4 rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-700 overflow-hidden">
        <div className="flex items-start gap-3 p-4">
          <ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">
              Vault backup recommended
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1 leading-relaxed">
              Your encryption is healthy on this device, but your vault backup is {hasBackup ? 'out of date' : 'missing'}.
              Back up now to ensure you can access these chats on your other devices.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Link href="/settings#vault">
                <Button size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white border-none">
                  <Upload className="mr-1.5 h-3 w-3" />
                  Update Vault Backup
                </Button>
              </Link>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDismissed(true)}
                className="h-8 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-100/50"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Restore via passphrase
  const handlePassphraseRestore = async () => {
    if (!passphrase.trim()) {
      toast({ variant: 'destructive', title: 'Enter passphrase', description: 'Please enter your vault recovery passphrase.' });
      return;
    }

    setIsRestoring(true);
    try {
      // Check if a backup exists first
      const { hasVaultBackup } = await import('@/lib/actions/vault-actions');
      const exists = await hasVaultBackup();

      if (!exists) {
        toast({
          variant: 'destructive',
          title: 'No backup found',
          description: 'No vault backup found. Create a backup on the device that has your keys first (Settings > Key Vault).',
        });
        return;
      }

      // Fetch and decrypt
      const { getVaultBackup } = await import('@/lib/actions/vault-actions');
      const backup = await getVaultBackup();
      if (!backup) throw new Error('Backup not found');

      const binaryStr = atob(backup.encryptedVaultBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      const { restoreVaultBackup } = await import('@/lib/crypto');
      const result = await restoreVaultBackup(bytes.buffer, backup.salt, passphrase, user?.id);

      setPassphrase('');
      setShowPassphraseInput(false);

      toast({
        title: result.imported > 0 ? 'Keys restored!' : 'Already up to date',
        description: result.imported > 0
          ? `${result.imported} bond key${result.imported !== 1 ? 's' : ''} synced to this device.`
          : 'All keys are already on this device.',
      });
    } catch (err: unknown) {
      const message = (err instanceof Error) ? err.message : 'Restore failed';
      if (message.includes('Invalid passphrase') || message.includes('Invalid password')) {
        toast({ variant: 'destructive', title: 'Wrong passphrase', description: 'The passphrase doesn\'t match the one used for backup.' });
      } else {
        toast({ variant: 'destructive', title: 'Restore failed', description: message });
      }
    } finally {
      setIsRestoring(false);
    }
  };

  // Restore via passkey (PRF)
  const handlePasskeyRestore = async () => {
    setIsPasskeyRestoring(true);
    try {
      const { authenticateWithPrf } = await import('@/lib/crypto/prf-webauthn-helpers');
      const { derivePrfWrappingKey, decryptAndRestoreVault } = await import('@/lib/crypto/prf-vault');

      // Get the PRF output from the passkey
      const prfResult = await authenticateWithPrf();
      if (!prfResult) {
        toast({ variant: 'destructive', title: 'Cancelled', description: 'Passkey authentication was cancelled.' });
        return;
      }

      // Derive wrapping key
      const wrappingKey = await derivePrfWrappingKey(prfResult.prfOutput);

      // Fetch vault from server
      const { getPrfVaultAction } = await import('@/lib/actions/key-vault-actions');
      const vault = await getPrfVaultAction(prfResult.credentialId);
      if (!vault) {
        toast({
          variant: 'destructive',
          title: 'No passkey vault',
          description: 'No vault backup is linked to this passkey. Back up from the device that has your keys first.',
        });
        return;
      }

      // Decode and decrypt
      const binaryStr = atob(vault.encryptedVaultBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      const result = await decryptAndRestoreVault(wrappingKey, bytes.buffer, user?.id);

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

  return (
    <>
      <div className="mx-auto max-w-4xl w-full mb-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 overflow-hidden">
        {/* Main alert */}
        <div className="flex items-start gap-3 p-4">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              {orphanedBondCount} bond{orphanedBondCount !== 1 ? 's' : ''} need key sync{orphanedBondNames.length > 0 && (
                <span className="font-normal">: {orphanedBondNames.join(', ')}</span>
              )}
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 leading-relaxed">
              The encryption keys for {orphanedBondCount === 1 ? 'this bond' : 'these bonds'} are
              on another device or browser session. Restore them here to decrypt those messages.
            </p>

            {/* Steps */}
            <div className="mt-3 space-y-1.5 text-xs text-amber-700 dark:text-amber-300">
              <p className="font-medium">How to sync:</p>
              {prfSupported ? (
                <ol className="list-decimal list-inside space-y-1 pl-1">
                  <li>Open Tribes on the device where you created the bond</li>
                  <li>Go to <span className="font-medium">Settings &gt; Key Vault &gt; {hasPrfVault ? 'Update Passkey Vault' : 'Back Up with Passkey'}</span></li>
                  <li>Come back here and tap <span className="font-medium">Sync with Passkey</span> below</li>
                </ol>
              ) : (
                <ol className="list-decimal list-inside space-y-1 pl-1">
                  <li>Open Tribes on the device where you created the bond</li>
                  <li>Go to <span className="font-medium">Settings &gt; Key Vault &gt; Update Backup</span></li>
                  <li>Come back here and restore with your passphrase</li>
                </ol>
              )}
            </div>

            {/* Backup freshness warning */}
            {hasBackup && backupDate && (
              <div className="mt-2 text-xs text-amber-600 dark:text-amber-400/80 leading-relaxed">
                {(() => {
                  const backupTime = new Date(backupDate).getTime();
                  const orphanTime = newestOrphanDate ? new Date(newestOrphanDate).getTime() : 0;
                  const dateStr = new Date(backupDate).toLocaleDateString();
                  const ageMs = Date.now() - backupTime;
                  const ageHours = Math.floor(ageMs / 3_600_000);

                  // If we know the orphan date, and the backup is older than the orphan
                  if (orphanTime > 0 && backupTime < orphanTime) {
                    return (
                      <p className="font-medium text-red-600 dark:text-red-400">
                        ⚠️ Your vault backup is from {dateStr}. It is <strong>older</strong> than your missing keys.
                        You MUST update the backup from your other device before restoring here.
                      </p>
                    );
                  }

                  // If the backup is newer than the orphan date, it may have the keys
                  if (orphanTime > 0 && backupTime >= orphanTime) {
                    return (
                      <p className="text-green-700 dark:text-green-400 font-medium">
                        ✓ Your vault backup ({dateStr}) is newer than these bonds — try restoring below.
                      </p>
                    );
                  }

                  // Fallback (should not hit this if newestOrphanDate works correctly)
                  return (
                    <p>
                      💡 Vault backup last updated: {dateStr} ({ageHours < 1 ? 'just now' : `${ageHours}h ago`}).
                    </p>
                  );
                })()}
              </div>
            )}
            {!hasBackup && (
              <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
                ⚠️ No vault backup found. Go to your other device and create one first
                (Settings &gt; Key Vault &gt; Create Backup).
              </p>
            )}

            {/* Inline passphrase restore form */}
            {showPassphraseInput && (
              <div ref={passphraseRef} className="mt-3 space-y-2 p-3 rounded-md border border-amber-400/50 bg-background/80 dark:bg-background/40">
                <Label htmlFor="banner-passphrase" className="text-xs font-medium">Recovery Passphrase</Label>
                <div className="relative">
                  <Input
                    id="banner-passphrase"
                    type={showPassphrase ? 'text' : 'password'}
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handlePassphraseRestore()}
                    placeholder="Enter your vault passphrase"
                    className="pr-10 text-sm h-9"
                    autoFocus
                    onFocus={() => {
                      setTimeout(() => {
                        passphraseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }, 350);
                    }}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassphrase(!showPassphrase)}
                  >
                    {showPassphrase ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handlePassphraseRestore}
                    disabled={isRestoring || !passphrase.trim()}
                    className="h-8 text-xs"
                  >
                    {isRestoring
                      ? <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> Restoring...</>
                      : <><Upload className="mr-1.5 h-3 w-3" /> Restore Keys</>
                    }
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setShowPassphraseInput(false); setPassphrase(''); }}
                    className="h-8 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Action buttons */}
            {!showPassphraseInput && (
              <div className="flex flex-wrap gap-2 mt-4">
                {prfSupported && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handlePasskeyRestore}
                    disabled={isRestoring || isPasskeyRestoring}
                    className="h-8 text-xs"
                  >
                    {isPasskeyRestoring
                      ? <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> Syncing...</>
                      : <><Fingerprint className="mr-1.5 h-3 w-3" /> Sync with Passkey</>
                    }
                  </Button>
                )}

                <Button
                  size="sm"
                  variant={prfSupported ? 'outline' : 'default'}
                  onClick={() => setShowPassphraseInput(true)}
                  disabled={isRestoring || isPasskeyRestoring}
                  className={`h-8 text-xs ${prfSupported ? 'border-amber-400 text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/50' : ''}`}
                >
                  <Upload className="mr-1.5 h-3 w-3" /> Restore with Password
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDismissed(true)}
                  className="h-8 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-800"
                >
                  Dismiss
                </Button>
              </div>
            )}

            {/* Advanced / destructive section */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 mt-3 text-xs text-amber-600/70 dark:text-amber-400/60 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
            >
              <ShieldAlert className="h-3 w-3" />
              Advanced: Reset keys
              {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {showAdvanced && (
              <div className="mt-2 p-3 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-700">
                <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">
                  <strong>This is destructive.</strong> Generating new keys will permanently break
                  decryption of all past messages from these bonds on every device. Only do this
                  if you no longer have access to the original device.
                </p>
                <Button
                  size="sm"
                  variant="destructive"
                  className="mt-2 h-7 text-xs"
                  onClick={() => setShowResetDialog(true)}
                >
                  <KeyRound className="mr-1.5 h-3 w-3" />
                  Reset Keys...
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <ResetKeysDialog
        open={showResetDialog}
        onOpenChange={setShowResetDialog}
        orphanedCount={orphanedBondCount}
        onConfirm={async () => {
          await rekeyOrphanedBonds();
          setShowResetDialog(false);
          toast({
            title: 'Keys reset',
            description: `New encryption keys generated for ${orphanedBondCount} bond${orphanedBondCount !== 1 ? 's' : ''}. Past encrypted messages from these bonds are no longer readable.`,
          });
        }}
      />
    </>
  );
}

