"use client";

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShieldCheck, ShieldAlert, Loader2, Globe2, Check, ExternalLink } from 'lucide-react';
import { getNsfwGateStatus, setAdultContentOptIn, submitAgeVerification, type NsfwGateStatus } from '@/lib/actions/age-actions';
import { runWalletVerification, runOnDeviceVerification, providerSupport, type WalletProvider } from '@/lib/age-verification/client';
import { useUser } from '@/components/providers/user-provider';

interface AgeGateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once every requirement for this region × surface is satisfied. */
  onResolved?: () => void;
}

/**
 * Unified 18+ age-gate modal (issue #32). Fetches the viewer's exact requirements
 * (getNsfwGateStatus) and walks them through the ordered steps for their region:
 *   open region   → [enable adult content]  (web-set self-attest)
 *   law state     → [verify age (Google Wallet)] → [enable adult content]
 *   blocked       → not available
 * Content/identity never touches the client beyond the attestation; the server stores
 * only the pass/fail outcome. Replaces the old vanishing remediation toasts.
 */
export function AgeVerificationDialog({ open, onOpenChange, onResolved }: AgeGateDialogProps) {
  const { user } = useUser();
  const [status, setStatus] = React.useState<NsfwGateStatus | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async (): Promise<NsfwGateStatus | null> => {
    try { const s = await getNsfwGateStatus(); setStatus(s); return s; }
    catch { setStatus(null); return null; }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setStatus(null);
    let active = true;
    getNsfwGateStatus().then((s) => { if (active) setStatus(s); }).catch(() => { if (active) setStatus(null); });
    return () => { active = false; };
  }, [open]);

  const resolveIfDone = React.useCallback((s: NsfwGateStatus): boolean => {
    if (s.regionTier === 'blocked') return false;
    const needVerify = s.regionTier === 'verify' && !s.hasVerified;
    const needOptIn = !s.hasOptIn;
    if (!needVerify && !needOptIn) {
      onResolved?.();
      onOpenChange(false);
      return true;
    }
    return false;
  }, [onResolved, onOpenChange]);

  const runVerify = async (providerId: string) => {
    setBusy(providerId);
    setError(null);
    try {
      if (providerId === 'dev') {
        const result = await submitAgeVerification({ provider: 'dev' });
        if (result && 'serverError' in (result as object)) {
          throw new Error((result as { serverError: string }).serverError);
        }
      } else if (providerId === 'privately') {
        // On-device (Privately) age estimation — runs on the device, not via a wallet.
        // PARKED: unreachable while the on-device provider is disabled (providers/privately.ts);
        // the dialog only renders providers from availableAgeProviders(), which omits 'privately'.
        if (!user?.id) throw new Error('Please sign in again and retry.');
        await runOnDeviceVerification(user.id);
      } else {
        await runWalletVerification(providerId as WalletProvider);
      }
      const s = await refresh();
      if (s) resolveIfDone(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const enableOnWeb = async () => {
    setBusy('optin');
    setError(null);
    try {
      await setAdultContentOptIn(true);
      const s = await refresh();
      if (s) resolveIfDone(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not enable adult content.');
    } finally {
      setBusy(null);
    }
  };

  const openWebSettings = () => {
    // On native, _blank opens the system browser (Capacitor default).
    window.open('https://tribes.app/settings', '_blank');
  };

  // ── Blocked region ─────────────────────────────────────────────────────────
  if (status?.regionTier === 'blocked') {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe2 className="h-5 w-5 text-muted-foreground" />
              Not available in your region
            </DialogTitle>
            <DialogDescription>
              Adult content isn’t available where you are right now. Some regions require
              age-verification methods we don’t currently support. This reflects local law,
              not a judgment — and it may change as those options improve.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const isVerifyRegion = status?.regionTier === 'verify';
  const hasVerified = !!status?.hasVerified;
  const hasOptIn = !!status?.hasOptIn;
  const isWeb = status?.surface === 'web';
  const wallets = (status?.providers ?? []).filter((p) => p.id !== 'dev');
  const dev = (status?.providers ?? []).find((p) => p.id === 'dev');

  // In law states the content toggle can't be enabled until age is verified.
  const optInBlockedOnVerify = isVerifyRegion && !hasVerified;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            This is an adult (18+) Tribe
          </DialogTitle>
          <DialogDescription>
            Its content is 18+ and end-to-end encrypted. To continue, complete the step
            {isVerifyRegion ? 's' : ''} below. You only do this once.
          </DialogDescription>
        </DialogHeader>

        {status === null ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4 py-1">
            {/* ── Step: Verify age (law states only) ─────────────────────────── */}
            {isVerifyRegion && (
              <StepBlock
                index={1}
                title="Verify your age"
                done={hasVerified}
              >
                {hasVerified ? (
                  <p className="text-sm text-muted-foreground">Age verified — thank you.</p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Your region requires age verification. Verify privately with Google
                      Wallet — we only ever learn that you’re over 18, never your ID or birthdate.
                    </p>
                    <div className="space-y-2 pt-1">
                      {wallets.map((p) => {
                        const sup = providerSupport(p.id);
                        return (
                          <div key={p.id} className="space-y-1">
                            <Button
                              className="w-full justify-start"
                              disabled={busy !== null || !sup.enabled}
                              onClick={() => runVerify(p.id)}
                            >
                              {busy === p.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                              {p.label}
                            </Button>
                            {!sup.enabled && sup.hint && (
                              <p className="text-xs text-muted-foreground pl-1">{sup.hint}</p>
                            )}
                          </div>
                        );
                      })}
                      {dev && (
                        <Button
                          variant="outline"
                          className="w-full justify-start border-dashed"
                          disabled={busy !== null}
                          onClick={() => runVerify('dev')}
                        >
                          {busy === 'dev' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                          {dev.label}
                        </Button>
                      )}
                      {wallets.length === 0 && !dev && (
                        <p className="text-sm text-muted-foreground">
                          No verification method is available yet. Wallet verification is being set up.
                        </p>
                      )}
                    </div>
                    {!isWeb && (
                      <p className="text-xs text-muted-foreground pt-1">
                        On iPhone you can also verify in a browser at tribes.app — it unlocks the app automatically.
                      </p>
                    )}
                  </>
                )}
              </StepBlock>
            )}

            {/* ── Step: Enable adult content (web-set toggle) ────────────────── */}
            <StepBlock
              index={isVerifyRegion ? 2 : 1}
              title="Enable adult content"
              done={hasOptIn}
            >
              {hasOptIn ? (
                <p className="text-sm text-muted-foreground">Adult content is enabled on your account.</p>
              ) : isWeb ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Adult content is hidden by default. Turn it on to confirm you’re 18 or older
                    and see adult Tribes.
                  </p>
                  <Button
                    className="w-full mt-1"
                    disabled={busy !== null || optInBlockedOnVerify}
                    onClick={enableOnWeb}
                  >
                    {busy === 'optin' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                    I’m 18+ — show adult content
                  </Button>
                  {optInBlockedOnVerify && (
                    <p className="text-xs text-muted-foreground pt-1">Complete age verification first.</p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    For App Store rules, adult content can only be enabled on the website. Open{' '}
                    <span className="font-medium">tribes.app</span> → Settings → Adult Content, then
                    return here.
                  </p>
                  <Button variant="outline" className="w-full mt-1" onClick={openWebSettings}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open tribes.app settings
                  </Button>
                </>
              )}
            </StepBlock>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy !== null}>
            Not now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A numbered step row with a done-check, used for the age-gate checklist. */
function StepBlock({
  index,
  title,
  done,
  children,
}: {
  index: number;
  title: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${
            done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}
        >
          {done ? <Check className="h-3 w-3" /> : index}
        </span>
        <span className={`text-sm font-medium ${done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
          {title}
        </span>
      </div>
      <div className="pl-7 space-y-2">{children}</div>
    </div>
  );
}
