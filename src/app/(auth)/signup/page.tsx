"use client";

import Link from "next/link";
import { useState, useCallback, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppLogo } from "@/components/icons/app-logo";
import { Fingerprint, Loader2, Mail, Ticket, CheckCircle2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { startRegistration } from "@simplewebauthn/browser";
import { registerUserAction, finishRegistrationAction } from "@/lib/auth-actions";
import { validateInviteCode } from '@/lib/actions/profile-actions';
import { useToast } from "@/hooks/use-toast";
import { HoneypotField } from "@/components/ui/captcha-challenge";
import { TurnstileWidget, type TurnstileWidgetRef } from "@/components/turnstile-widget";

const INVITE_ONLY = process.env.NEXT_PUBLIC_INVITE_ONLY === 'true';

function SignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isInviteValidated, setIsInviteValidated] = useState(!INVITE_ONLY); // skip if not invite-only
  const [invitePlanName, setInvitePlanName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetRef | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [tosAgreed, setTosAgreed] = useState(false);

  useEffect(() => {
    const error = searchParams.get('error');
    if (error) {
      let description = "An unknown error occurred.";
      if (error === 'invite_required') description = "An invite code is required to sign up with Google.";
      if (error === 'invalid_invite') description = "The provided invite code is invalid.";
      if (error === 'invalid_state') description = "Security state mismatch. Please try again.";
      if (error === 'google_denied') description = "Google authentication was denied.";

      toast({
        variant: "destructive",
        title: "Sign In Error",
        description,
      });
      // Clear the error from the URL
      router.replace('/signup', { scroll: false });
    }
  }, [searchParams, router, toast]);

  // Auto-fill invite code from URL (e.g. ?invite=TRIBE-XXXX-XXXX)
  const [autoValidateAttempted, setAutoValidateAttempted] = useState(false);
  useEffect(() => {
    const urlInvite = searchParams.get('invite');
    if (urlInvite && INVITE_ONLY && !isInviteValidated && !autoValidateAttempted) {
      setAutoValidateAttempted(true);
      const code = urlInvite.trim().toUpperCase();
      setInviteCode(code);
      // Auto-validate
      (async () => {
        setIsValidatingCode(true);
        try {
          const result = await validateInviteCode(code);
          setIsInviteValidated(true);
          setInvitePlanName(result.planName);
          toast({ title: 'Invite Code Valid!', description: `This code grants access to the ${result.planName} plan.` });
        } catch {
          // Code invalid — let user enter a different one
        } finally {
          setIsValidatingCode(false);
        }
      })();
    }
  }, [searchParams, isInviteValidated, autoValidateAttempted, toast]);

  const handleTurnstileVerified = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  const handleTurnstileExpired = useCallback(() => {
    setTurnstileToken(null);
  }, []);

  async function handleValidateInvite() {
    if (!inviteCode.trim()) return;
    setIsValidatingCode(true);
    try {
      const result = await validateInviteCode(inviteCode);
      setIsInviteValidated(true);
      setInvitePlanName(result.planName);
      toast({
        title: "Invite Code Valid!",
        description: `This code grants access to the ${result.planName} plan.`,
      });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Invalid Code",
        description: ((error instanceof Error) ? error.message : 'An error occurred') || "This invite code is not valid.",
      });
    } finally {
      setIsValidatingCode(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email) return;
    if (INVITE_ONLY && !isInviteValidated) return;

    // Honeypot check
    const honeypot = (document.getElementById('website_url') as HTMLInputElement)?.value;
    if (honeypot) {
      // Bot detected — silently fail
      toast({ title: "Account Created!", description: "Your passkey has been registered successfully." });
      return;
    }

    // Turnstile bot challenge — pass token if available, server validates server-side
    // (widget may not fire in all environments; server gracefully skips if no key configured)
    if (turnstileToken === null) {
      // Token not yet received — still attempt registration (server will validate)
      console.debug('[turnstile] No token yet, proceeding without client challenge');
    }

    setIsLoading(true);
    try {
      // 1. Get registration options from server (with invite code validation)
      const result = await registerUserAction(name, email, inviteCode || undefined, turnstileToken ?? undefined);

      // Surface any server-side errors (rate limit, duplicate email, bot check, etc.)
      if ('error' in result) {
        toast({ variant: 'destructive', title: 'Registration Failed', description: result.error });
        turnstileRef.current?.reset();
        setTurnstileToken(null);
        setIsLoading(false);
        return;
      }

      const { options, userId, inviteCode: validatedCode } = result;

      // 2. Start biometric registration in browser
      const regResponse = await startRegistration({
        optionsJSON: options,
      });

      // 3. Finish registration on server (auto-redeems invite code)
      await finishRegistrationAction(userId, regResponse, validatedCode);

      // 4. Initialize E2E Vault (Phase 3: PRF)
      try {
        const { derivePrfWrappingKey, encryptVaultWithPrf } = await import('@/lib/crypto');
        const { getOrCreateJournalKey } = await import('@/lib/crypto/journal-encryption');
        const { savePrfVaultAction } = await import('@/lib/actions/key-vault-actions');

        // Create the initial personal journal key (stored in IndexedDB)
        console.log('[auth] Initializing E2E journal key...');
        await getOrCreateJournalKey();

        // Evaluate PRF output from registration
        // @ts-expect-error — PRF extension results type not yet in @simplewebauthn/browser types
        const rawPrf = regResponse.clientExtensionResults?.prf?.results?.first;
        // Validate it is actually an ArrayBuffer of the expected size before use
        const prfOutput = rawPrf instanceof ArrayBuffer && rawPrf.byteLength >= 32 ? rawPrf : null;

        if (prfOutput) {
          console.log('[auth] PRF extension found, creating initial vault...');
          const wrappingKey = await derivePrfWrappingKey(prfOutput);
          const encryptedVault = await encryptVaultWithPrf(wrappingKey);
          
          // Efficiently convert ArrayBuffer to base64 via Buffer (O(n), not O(n^2))
          const base64Vault = Buffer.from(encryptedVault).toString('base64');

          await savePrfVaultAction(base64Vault, regResponse.id);
          console.log('[auth] Initial PRF vault saved.');
        } else {
          console.warn('[auth] Authenticator did not provide a valid PRF output. Skipping vault creation.');
        }
      } catch (cryptoErr) {
        console.error('[auth] E2E initialization failed:', cryptoErr);
        // We don't block registration if vault creation fails, but it is a degraded state.
      }

      // Record TOS acceptance (user checked the checkbox before submit)
      try {
        const { acceptTermsOfService } = await import('@/lib/actions/legal-actions');
        const { getLatestTosVersion } = await import('@/lib/actions/legal-actions');
        const latest = await getLatestTosVersion();
        await acceptTermsOfService(latest.version);
      } catch (tosErr) {
        console.warn('[auth] Failed to record TOS acceptance at signup:', tosErr);
      }

      toast({
        title: "Account Created!",
        description: "Your passkey has been registered successfully.",
      });

      // Redirect to returnTo (e.g. the tribe/bond invite) or default feed
      const returnTo = searchParams.get('returnTo');
      router.push(returnTo || "/your-comms");
    } catch (error: unknown) {
      console.error("Signup failed:", error);

      // Handle user cancelling the passkey prompt gracefully
      const errObj = error instanceof Error ? error : null;
      if (errObj?.name === 'NotAllowedError' || errObj?.message?.includes('timed out or was not allowed')) {
        toast({
          title: "Registration Cancelled",
          description: "Passkey creation was cancelled. You can try again when you're ready.",
        });
        return; // Don't show the generic error
      }

      // Sanitize error messages — never expose raw browser/server internals to users
      toast({
        variant: "destructive",
        title: "Registration Failed",
        description: "There was an error creating your account. Please try again.",
      });
      // Reset Turnstile so the user gets a fresh token on retry
      turnstileRef.current?.reset();
      setTurnstileToken(null);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <AppLogo width={64} height={64} />
          </div>
          <CardTitle className="text-3xl font-bold font-mono text-primary">Join Tribes</CardTitle>
          <CardDescription>Secure, local-first community identity</CardDescription>
        </CardHeader>
        <form onSubmit={handleSignup}>
          <CardContent className="space-y-4">
            {/* Invite-Only Gate */}
            {INVITE_ONLY && (
              <div className="space-y-2">
                <Label htmlFor="inviteCode" className="flex items-center gap-1.5">
                  <Ticket className="h-4 w-4" />
                  Invite Code {isInviteValidated && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                </Label>
                {!isInviteValidated ? (
                  <div className="flex gap-2">
                    <Input
                      id="inviteCode"
                      type="text"
                      placeholder="TRIBE-XXXX-XXXX"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      disabled={isValidatingCode}
                      className="font-mono"
                    />
                    <Button
                      type="button"
                      onClick={handleValidateInvite}
                      disabled={!inviteCode.trim() || isValidatingCode}
                      variant="secondary"
                      className="shrink-0"
                    >
                      {isValidatingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-green-600 font-medium">
                    ✓ Valid — {invitePlanName} access granted
                  </p>
                )}
                {!isInviteValidated && (
                  <p className="text-xs text-muted-foreground">
                    Tribes is currently invite-only. Enter your code to proceed.
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input 
                id="name" 
                type="text" 
                placeholder="Captain Nemo" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                required 
                disabled={isLoading || !isInviteValidated}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="nemo@nautilus.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required 
                disabled={isLoading || !isInviteValidated}
              />
            </div>

            {/* Honeypot + Turnstile bot protection */}
            <HoneypotField />
            <TurnstileWidget
              ref={turnstileRef}
              onVerified={handleTurnstileVerified}
              onExpired={handleTurnstileExpired}
              className="mt-1"
            />
            
            {/* TOS Agreement Checkbox */}
            <div className="flex items-start gap-3 pt-2">
              <Checkbox
                id="tos-signup-agree"
                checked={tosAgreed}
                onCheckedChange={(checked) => setTosAgreed(checked === true)}
                disabled={isLoading || !isInviteValidated}
              />
              <label
                htmlFor="tos-signup-agree"
                className="text-sm leading-relaxed cursor-pointer text-muted-foreground"
              >
                I agree to the{" "}
                <Link href="/terms" target="_blank" className="text-primary underline">Terms of Service</Link>
                {" "}and{" "}
                <Link href="/privacy" target="_blank" className="text-primary underline">Privacy Policy</Link>.
              </label>
            </div>

            <div className="pt-4 space-y-3">
              <Button 
                type="submit" 
                disabled={isLoading || !name || !email || !tosAgreed || (INVITE_ONLY && !isInviteValidated)}
                className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-lg"
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Fingerprint className="mr-2 h-5 w-5" />
                )}
                Register with Passkey
              </Button>
              
              <div className="relative flex items-center justify-center py-2">
                <span className="absolute inset-x-0 h-px bg-muted" />
                <span className="relative bg-background px-2 text-xs text-muted-foreground uppercase">
                  Or use SSO fallback
                </span>
              </div>

              <Button 
                type="button" 
                variant="outline" 
                className="w-full h-11 border-primary/20 hover:bg-primary/5"
                disabled={isLoading || !tosAgreed || (INVITE_ONLY && !isInviteValidated)}
                onClick={() => {
                  const url = new URL('/api/auth/google', window.location.origin);
                  if (inviteCode) url.searchParams.set('invite', inviteCode);
                  window.location.href = url.toString();
                }}
              >
                <Mail className="mr-2 h-4 w-4" />
                Continue with Google
              </Button>
            </div>
          </CardContent>
        </form>
        <CardFooter className="flex flex-col gap-4 border-t pt-6 bg-muted/30">
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Log In
            </Link>
          </p>
          <p className="text-center text-xs text-muted-foreground">
            <Link href="/terms" className="underline hover:text-foreground">Terms of Service</Link>
            {" · "}
            <Link href="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>
            {" · "}
            <Link href="/community-guidelines" className="underline hover:text-foreground">Guidelines</Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <SignupForm />
    </Suspense>
  );
}
