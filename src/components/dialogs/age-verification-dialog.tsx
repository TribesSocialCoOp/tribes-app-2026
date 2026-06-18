"use client";

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Loader2, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getAgeVerificationStatus, submitAgeVerification } from '@/lib/actions/age-actions';
import { runWalletVerification, type WalletProvider } from '@/lib/age-verification/client';

interface AgeVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the account is successfully verified 18+. */
  onVerified?: () => void;
}

/**
 * 18+ age verification flow (issue #32). Offers the available high-assurance wallet
 * providers (Google / Apple Wallet) and, in non-production, a dev provider that runs
 * through the exact same server verifier + flag-setting path — so the real gate loop
 * is testable without a wallet credential. Content/identity never touches the client
 * beyond the attestation; the server stores only the pass/fail outcome.
 */
export function AgeVerificationDialog({ open, onOpenChange, onVerified }: AgeVerificationDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState<string | null>(null);
  const [providers, setProviders] = React.useState<{ id: string; label: string }[] | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let active = true;
    getAgeVerificationStatus()
      .then((s) => { if (active) setProviders(s.providers); })
      .catch(() => { if (active) setProviders([]); });
    return () => { active = false; };
  }, [open]);

  const runProvider = async (providerId: string) => {
    setLoading(providerId);
    try {
      if (providerId === 'dev') {
        // Dev provider: no wallet round-trip — submit directly through the same verifier.
        const result = await submitAgeVerification({ provider: 'dev' });
        if (result && 'serverError' in (result as object)) {
          throw new Error((result as { serverError: string }).serverError);
        }
      } else {
        // Wallet providers: full Digital Credentials API round-trip, then server verify.
        await runWalletVerification(providerId as WalletProvider);
      }
      toast({ title: 'Age verified', description: "You're verified as 18+. NSFW Tribes are now unlocked." });
      onOpenChange(false);
      onVerified?.();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Verification failed',
        description: e instanceof Error ? e.message : 'Please try a different method.',
      });
    } finally {
      setLoading(null);
    }
  };

  const wallets = (providers ?? []).filter((p) => p.id !== 'dev');
  const dev = (providers ?? []).find((p) => p.id === 'dev');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            Verify you&apos;re 18+
          </DialogTitle>
          <DialogDescription>
            NSFW Tribes require a one-time age check. We use a privacy-preserving wallet
            attestation — the platform only ever receives a yes/no. We never see or store
            your name, birthdate, or ID. You only do this once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {providers === null ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <>
              {wallets.map((p) => (
                <Button
                  key={p.id}
                  variant="default"
                  className="w-full justify-start"
                  disabled={loading !== null}
                  onClick={() => runProvider(p.id)}
                >
                  {loading === p.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                  {p.label}
                </Button>
              ))}

              {wallets.length === 0 && !dev && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No verification method is available yet. Wallet verification is being set up.
                </p>
              )}

              {dev && (
                <Button
                  variant="outline"
                  className="w-full justify-start border-dashed"
                  disabled={loading !== null}
                  onClick={() => runProvider('dev')}
                >
                  {loading === 'dev' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                  {dev.label}
                </Button>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading !== null}>
            Not now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
