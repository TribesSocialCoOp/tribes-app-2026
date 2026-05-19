"use client";

import Link from "next/link";
import { useState, useCallback, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppLogo } from "@/components/icons/app-logo";
import { Fingerprint, Loader2, Mail, Ticket, CheckCircle2, AlertTriangle, KeyRound, XCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { startRegistration } from "@simplewebauthn/browser";
import { registerUserAction, finishRegistrationAction, registerWithPasswordAction } from "@/lib/auth-actions";
import { validateInviteCode } from '@/lib/actions/profile-actions';
import { useToast } from "@/hooks/use-toast";
import { isAuthMethodEnabled } from "@/lib/auth/auth-config";
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
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [webAuthnSupported, setWebAuthnSupported] = useState<boolean | null>(null);

  // Username & Password fallback state
  const [signupMethod, setSignupMethod] = useState<'passkey' | 'password'>('passkey');
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (webAuthnSupported === false) {
      setSignupMethod('password');
    }
  }, [webAuthnSupported]);

  useEffect(() => {
    const isSupported = typeof window !== 'undefined'
      && !!window.PublicKeyCredential
      && typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function';

    if (isSupported) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then(available => {
          setWebAuthnSupported(available);
        })
        .catch(() => {
          setWebAuthnSupported(false);
        });
    } else {
      setWebAuthnSupported(false);
    }
  }, []);

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

  async function handleSandboxInviteClick(code: string) {
    setInviteCode(code);
    setIsValidatingCode(true);
    try {
      const result = await validateInviteCode(code);
      setIsInviteValidated(true);
      setInvitePlanName(result.planName);
      toast({
        title: "Sandbox Code Validated!",
        description: `Successfully validated invite code for ${result.planName} plan.`,
      });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Sandbox Validation Failed",
        description: error instanceof Error ? error.message : "This invite code is not valid.",
      });
    } finally {
      setIsValidatingCode(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email) return;
    if (INVITE_ONLY && !isInviteValidated) return;

    if (signupMethod === 'password') {
      const meetsMinLength = password.length >= 12;
      const hasUppercase = /[A-Z]/.test(password);
      const hasLowercase = /[a-z]/.test(password);
      const hasNumberOrSymbol = /[0-9]/.test(password) || /[!@#$%^&*(),.?":{}|<>]/.test(password);
      const matchesConfirm = password === confirmPassword;

      if (!meetsMinLength || !hasUppercase || !hasLowercase || !hasNumberOrSymbol || !matchesConfirm) {
        toast({
          variant: "destructive",
          title: "Invalid Password",
          description: "Please make sure your password matches all requirements and matches the confirmation.",
        });
        return;
      }
    }

    // Honeypot check
    const honeypot = (document.getElementById('website_url') as HTMLInputElement)?.value;
    if (honeypot) {
      // Bot detected — silently fail
      toast({ title: "Account Created!", description: "Your account has been registered successfully." });
      return;
    }

    setIsLoading(true);
    try {
      if (signupMethod === 'password') {
        const result = await registerWithPasswordAction(
          name,
          email,
          username,
          password,
          inviteCode || undefined,
          turnstileToken ?? undefined
        );

        if ('error' in result) {
          toast({ variant: 'destructive', title: 'Registration Failed', description: result.error });
          turnstileRef.current?.reset();
          setTurnstileToken(null);
          setIsLoading(false);
          return;
        }

        // Initialize local E2E key in IndexedDB
        try {
          const { getOrCreateJournalKey } = await import('@/lib/crypto/journal-encryption');
          await getOrCreateJournalKey();
          console.log('[auth] Initialized local E2E key store for password user.');
        } catch (cryptoErr) {
          console.error('[auth] Failed to initialize local E2E key store:', cryptoErr);
        }
      } else {
        // 1. Get registration options from server
        const result = await registerUserAction(name, email, inviteCode || undefined, turnstileToken ?? undefined);

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

        // 3. Finish registration on server
        await finishRegistrationAction(userId, regResponse, name, email, validatedCode);

        // 4. Initialize E2E Vault (Phase 3: PRF)
        try {
          const { derivePrfWrappingKey, encryptVaultWithPrf } = await import('@/lib/crypto');
          const { getOrCreateJournalKey } = await import('@/lib/crypto/journal-encryption');
          const { savePrfVaultAction } = await import('@/lib/actions/key-vault-actions');

          console.log('[auth] Initializing E2E journal key...');
          await getOrCreateJournalKey();

          // @ts-expect-error — PRF extension results type not yet in @simplewebauthn/browser types
          const rawPrf = regResponse.clientExtensionResults?.prf?.results?.first;
          const prfOutput = rawPrf instanceof ArrayBuffer && rawPrf.byteLength >= 32 ? rawPrf : null;

          if (prfOutput) {
            console.log('[auth] PRF extension found, creating initial vault...');
            const wrappingKey = await derivePrfWrappingKey(prfOutput);
            const encryptedVault = await encryptVaultWithPrf(wrappingKey);
            const base64Vault = Buffer.from(encryptedVault).toString('base64');

            await savePrfVaultAction(base64Vault, regResponse.id);
            console.log('[auth] Initial PRF vault saved.');
          } else {
            console.warn('[auth] Authenticator did not provide a valid PRF output. Skipping vault creation.');
          }
        } catch (cryptoErr) {
          console.error('[auth] E2E initialization failed:', cryptoErr);
        }
      }

      // Record TOS acceptance
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
        description: signupMethod === 'password'
          ? "Your account has been created successfully."
          : "Your passkey has been registered successfully.",
      });

      const returnTo = searchParams.get('returnTo');
      router.push(returnTo || "/your-comms");
    } catch (error: unknown) {
      console.error("Signup failed:", error);

      const errObj = error instanceof Error ? error : null;
      if (errObj?.name === 'NotAllowedError' || errObj?.message?.includes('timed out or was not allowed')) {
        toast({
          title: "Registration Cancelled",
          description: "Passkey creation was cancelled. You can try again when you're ready.",
        });
        return;
      }

      toast({
        variant: "destructive",
        title: "Registration Failed",
        description: "There was an error creating your account. Please try again.",
      });
      turnstileRef.current?.reset();
      setTurnstileToken(null);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground p-4">
      <Card className="w-full max-w-md shadow-2xl border border-border/80 bg-card text-card-foreground">
        <CardHeader className="space-y-2 text-center pt-8">
          <div className="flex justify-center mb-4 text-primary">
            <AppLogo width={64} height={64} />
          </div>
          <CardTitle className="text-2xl font-bold font-mono tracking-tight">Join Tribes</CardTitle>
          <CardDescription>Secure, local-first community identity</CardDescription>
        </CardHeader>
        <form onSubmit={handleSignup}>
          <CardContent className="space-y-4 px-6 py-2">
            {/* Invite-Only Gate */}
            {INVITE_ONLY && (
              <div className="space-y-2 p-3 bg-muted/40 border border-border rounded-xl">
                <Label htmlFor="inviteCode" className="flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase font-mono text-muted-foreground">
                  <Ticket className="h-3.5 w-3.5 text-primary" />
                  Invite Code {isInviteValidated && <CheckCircle2 className="h-4 w-4 text-emerald-500 inline ml-1" />}
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
                      className="font-mono h-10 bg-background border-input focus-visible:ring-primary rounded-xl"
                    />
                    <Button
                      type="button"
                      onClick={handleValidateInvite}
                      disabled={!inviteCode.trim() || isValidatingCode}
                      variant="secondary"
                      className="shrink-0 h-10 px-4 bg-muted hover:bg-muted/80 text-foreground border border-border font-semibold rounded-xl"
                    >
                      {isValidatingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold tracking-wide font-mono">
                    ✓ Valid — {invitePlanName} access granted
                  </p>
                )}
                {!isInviteValidated && (
                  <p className="text-[10px] text-muted-foreground font-medium">
                    Tribes is currently invite-only. Enter a code to proceed.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs font-semibold tracking-wider uppercase font-mono text-muted-foreground">Full Name</Label>
              <Input 
                id="name" 
                type="text" 
                placeholder="Captain Nemo" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                required 
                disabled={isLoading || !isInviteValidated}
                className="h-11 bg-background border-input focus-visible:ring-primary rounded-xl"
              />
            </div>

            {signupMethod === 'password' && (
              <div className="space-y-2">
                <Label htmlFor="username" className="text-xs font-semibold tracking-wider uppercase font-mono text-muted-foreground">Username</Label>
                <Input 
                  id="username" 
                  type="text" 
                  placeholder="nemo" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required 
                  disabled={isLoading || !isInviteValidated}
                  className="lowercase h-11 bg-background border-input focus-visible:ring-primary rounded-xl"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-semibold tracking-wider uppercase font-mono text-muted-foreground">Email Address</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="nemo@nautilus.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required 
                disabled={isLoading || !isInviteValidated}
                className="h-11 bg-background border-input focus-visible:ring-primary rounded-xl"
              />
            </div>

            {signupMethod === 'password' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-xs font-semibold tracking-wider uppercase font-mono text-muted-foreground">Password</Label>
                  <Input 
                    id="password" 
                    type="password" 
                    required 
                    disabled={isLoading || !isInviteValidated}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 bg-background border-input focus-visible:ring-primary rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password" className="text-xs font-semibold tracking-wider uppercase font-mono text-muted-foreground">Confirm Password</Label>
                  <Input 
                    id="confirm-password" 
                    type="password" 
                    required 
                    disabled={isLoading || !isInviteValidated}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-11 bg-background border-input focus-visible:ring-primary rounded-xl"
                  />
                </div>

                {/* Password strength checklist */}
                <div className="p-4 bg-muted/40 border border-border rounded-xl space-y-2 text-[11px] font-mono text-muted-foreground">
                  <span className="font-bold text-muted-foreground uppercase tracking-widest text-[9px] block mb-1">Complexity Requirements</span>
                  <div className="flex items-center gap-2">
                    {password.length >= 12 ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                    )}
                    <span className={password.length >= 12 ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-muted-foreground"}>
                      At least 12 characters
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/[A-Z]/.test(password) ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                    )}
                    <span className={/[A-Z]/.test(password) ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-muted-foreground"}>
                      At least one uppercase letter
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/[a-z]/.test(password) ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                    )}
                    <span className={/[a-z]/.test(password) ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-muted-foreground"}>
                      At least one lowercase letter
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(/[0-9]/.test(password) || /[!@#$%^&*(),.?":{}|<>]/.test(password)) ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                    )}
                    <span className={(/[0-9]/.test(password) || /[!@#$%^&*(),.?":{}|<>]/.test(password)) ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-muted-foreground"}>
                      At least one number or symbol
                    </span>
                  </div>
                  {confirmPassword.length > 0 && (
                    <div className="flex items-center gap-2 pt-2 border-t border-border/40 mt-1 font-mono">
                      {password === confirmPassword ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                      )}
                      <span className={password === confirmPassword ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-destructive font-medium"}>
                        {password === confirmPassword ? "Passwords match" : "Passwords do not match"}
                      </span>
                    </div>
                  )}
                </div>

                {/* E2E Informational Alert Callout */}
                <div className="p-4 bg-muted/40 border border-border rounded-xl text-xs space-y-1.5 leading-relaxed text-muted-foreground">
                  <p className="font-bold flex items-center gap-1.5 text-primary">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-primary" />
                    Vault Backup Warning
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    With username & password registration, E2E encryption keys cannot sync automatically across devices. You <strong>must</strong> manually save your Recovery Phrase under <strong>Settings → Vault Backup</strong> after signing up.
                  </p>
                </div>
              </>
            )}

            {/* Honeypot + Turnstile bot protection */}
            <HoneypotField />
            <TurnstileWidget
              ref={turnstileRef}
              onVerified={handleTurnstileVerified}
              onExpired={handleTurnstileExpired}
              className="mt-1"
            />
            
            {/* Age Confirmation Checkbox */}
            <div className="flex items-start gap-3 pt-2">
              <Checkbox
                id="age-confirm"
                checked={ageConfirmed}
                onCheckedChange={(checked) => setAgeConfirmed(checked === true)}
                disabled={isLoading || !isInviteValidated}
                className="mt-0.5 border-input bg-background data-[state=checked]:bg-primary data-[state=checked]:border-primary rounded-md"
              />
              <label
                htmlFor="age-confirm"
                className="text-xs leading-normal cursor-pointer text-muted-foreground select-none font-medium"
              >
                I confirm that I am at least 13 years old.
              </label>
            </div>

            {/* TOS Agreement Checkbox */}
            <div className="flex items-start gap-3 pt-1">
              <Checkbox
                id="tos-signup-agree"
                checked={tosAgreed}
                onCheckedChange={(checked) => setTosAgreed(checked === true)}
                disabled={isLoading || !isInviteValidated}
                className="mt-0.5 border-input bg-background data-[state=checked]:bg-primary data-[state=checked]:border-primary rounded-md"
              />
              <label
                htmlFor="tos-signup-agree"
                className="text-xs leading-normal cursor-pointer text-muted-foreground select-none font-medium"
              >
                I agree to the{" "}
                <Link href="/terms" target="_blank" className="text-primary hover:underline font-semibold transition-colors">Terms of Service</Link>
                {" "}and{" "}
                <Link href="/privacy" target="_blank" className="text-primary hover:underline font-semibold transition-colors">Privacy Policy</Link>.
              </label>
            </div>

            <div className="pt-4 space-y-3">
              {webAuthnSupported === false && signupMethod === 'passkey' && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-600 dark:text-amber-400">
                  <p className="font-semibold mb-1">Passkeys Not Supported</p>
                  <p className="leading-relaxed text-muted-foreground">
                    Your browser or device does not support secure passkey registration. Please use the password option below.
                  </p>
                </div>
              )}

              {signupMethod === 'password' ? (
                <Button 
                  type="submit" 
                  disabled={
                    isLoading || 
                    !name || 
                    !email || 
                    !username || 
                    password.length < 12 ||
                    !/[A-Z]/.test(password) ||
                    !/[a-z]/.test(password) ||
                    (!/[0-9]/.test(password) && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) ||
                    password !== confirmPassword ||
                    !tosAgreed || 
                    !ageConfirmed || 
                    (INVITE_ONLY && !isInviteValidated)
                  }
                  className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base shadow-sm rounded-xl"
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <KeyRound className="mr-2 h-5 w-5" />
                  )}
                  Register with Password
                </Button>
              ) : (
                <Button 
                  type="submit" 
                  disabled={isLoading || !name || !email || !tosAgreed || !ageConfirmed || (INVITE_ONLY && !isInviteValidated) || webAuthnSupported === false}
                  className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base shadow-sm rounded-xl"
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <Fingerprint className="mr-2 h-5 w-5" />
                  )}
                  Register with Passkey
                </Button>
              )}
              
              {/* Subtle Theme-friendly Partition Line */}
              <div className="relative flex items-center justify-center my-6">
                <span className="absolute inset-x-0 h-px bg-border" />
                <span className="relative bg-card px-3 text-[10px] uppercase tracking-wider text-muted-foreground font-bold font-mono">
                  Or continue with
                </span>
              </div>

              {/* Side-by-Side Compact SSO buttons */}
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  type="button" 
                  variant="outline" 
                  className="h-11 border-border bg-background hover:bg-accent text-foreground flex items-center justify-center gap-2 rounded-xl text-xs font-semibold"
                  disabled={isLoading || !tosAgreed || !ageConfirmed || (INVITE_ONLY && !isInviteValidated)}
                  onClick={() => {
                    const url = new URL('/api/auth/google', window.location.origin);
                    if (inviteCode) url.searchParams.set('invite', inviteCode);
                    window.location.href = url.toString();
                  }}
                >
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Google
                </Button>

                <Button 
                  type="button" 
                  variant="outline" 
                  className="h-11 border-border bg-background hover:bg-accent text-foreground flex items-center justify-center gap-2 rounded-xl text-xs font-semibold"
                  disabled={isLoading || !tosAgreed || !ageConfirmed || (INVITE_ONLY && !isInviteValidated)}
                  onClick={async () => {
                    const cap = (window as any).Capacitor;
                    const isNativeIos = cap?.isNativePlatform?.() && cap?.getPlatform?.() === 'ios';

                    if (isNativeIos) {
                      try {
                        const { SignInWithApple } = await import('@capacitor-community/apple-sign-in');
                        const result = await SignInWithApple.authorize({
                          clientId: 'app.tribes.web',
                          redirectURI: 'https://tribes.app/api/auth/apple/callback',
                          scopes: 'name email',
                        });

                        const res = await fetch('/api/auth/apple/native', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            identityToken: result.response.identityToken,
                            givenName: result.response.givenName,
                            familyName: result.response.familyName,
                            email: result.response.email,
                            inviteCode: inviteCode || undefined,
                          }),
                        });

                        if (!res.ok) {
                          const data = await res.json();
                          throw new Error(data.error || 'Apple sign-in failed');
                        }

                        const returnTo = searchParams.get('returnTo');
                        router.push(returnTo || '/your-comms');
                      } catch (err: any) {
                        if (err?.message?.includes('cancelled') || err?.code === '1001') return;
                        console.error('[Apple Native] Error:', err);
                        toast({
                          variant: 'destructive',
                          title: 'Sign Up Error',
                          description: err?.message || 'Apple authentication failed. Please try again.',
                        });
                      }
                    } else {
                      const url = new URL('/api/auth/apple', window.location.origin);
                      if (inviteCode) url.searchParams.set('invite', inviteCode);
                      window.location.href = url.toString();
                    }
                  }}
                >
                  <svg className="h-4 w-4 fill-current text-foreground" viewBox="0 0 24 24">
                    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                  Apple
                </Button>
              </div>
            </div>
          </CardContent>
        </form>
        <CardFooter className="flex flex-col gap-4 border-t border-border/40 pt-6 pb-8 bg-muted/20">
          {/* State toggle link */}
          {isAuthMethodEnabled('password') && webAuthnSupported !== false && (
            <button
              type="button"
              onClick={() => setSignupMethod(signupMethod === 'passkey' ? 'password' : 'passkey')}
              className="text-sm font-bold text-primary hover:text-primary/80 hover:underline transition-colors mt-1"
            >
              {signupMethod === 'passkey' ? "I prefer to use a password" : "I prefer to use a passkey"}
            </button>
          )}

          <p className="text-center text-sm text-muted-foreground font-medium">
            Already have an account?{" "}
            <Link href="/login" className="font-bold text-primary hover:text-primary/80 hover:underline transition-colors">
              Log In
            </Link>
          </p>
          <p className="text-center text-[10px] text-muted-foreground font-medium tracking-wide">
            <Link href="/terms" className="underline hover:text-foreground transition-colors">Terms of Service</Link>
            {" · "}
            <Link href="/privacy" className="underline hover:text-foreground transition-colors">Privacy Policy</Link>
            {" · "}
            <Link href="/community-guidelines" className="underline hover:text-foreground transition-colors">Guidelines</Link>
          </p>
        </CardFooter>
      </Card>

      {/* Dev Sandbox Widget for Seeded Invite Codes in local development */}
      {process.env.NODE_ENV === "development" && INVITE_ONLY && (
        <div className="w-full max-w-md mt-6 p-4 bg-muted/40 border border-dashed border-border rounded-xl space-y-3">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block text-center font-mono">
            Dev Sandbox - Seeded Invite Codes
          </span>
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSandboxInviteClick('FOUNDING-ALPHA-001')}
              disabled={isValidatingCode || isInviteValidated}
              className="w-full h-9 bg-background hover:bg-accent font-mono text-[10px] tracking-wide rounded-lg flex items-center justify-between px-4 border border-border"
            >
              <span>🎫 founding-alpha-001</span>
              <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded uppercase font-semibold">Co-Op Plan</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSandboxInviteClick('FOUNDING-BETA-001')}
              disabled={isValidatingCode || isInviteValidated}
              className="w-full h-9 bg-background hover:bg-accent font-mono text-[10px] tracking-wide rounded-lg flex items-center justify-between px-4 border border-border"
            >
              <span>🎫 founding-beta-001</span>
              <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded uppercase font-semibold">Co-Op Plan</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSandboxInviteClick('INVITE-TSM-TEST')}
              disabled={isValidatingCode || isInviteValidated}
              className="w-full h-9 bg-background hover:bg-accent font-mono text-[10px] tracking-wide rounded-lg flex items-center justify-between px-4 border border-border"
            >
              <span>🎫 invite-tsm-test</span>
              <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded uppercase font-semibold">Free Plan</span>
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground font-medium text-center leading-normal">
            Click any code to instantly auto-fill and auto-validate.
          </p>
        </div>
      )}
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
