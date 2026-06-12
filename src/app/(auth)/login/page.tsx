"use client";

import Link from "next/link";
import { useState, useEffect, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppLogo } from "@/components/icons/app-logo";
import { Fingerprint, Loader2, Mail, KeyRound } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import { loginUserAction, finishLoginAction, loginWithPasswordAction, verifyTotpAndLoginAction } from "@/lib/auth-actions";
import { useToast } from "@/hooks/use-toast";
import { isAuthMethodEnabled } from "@/lib/auth/auth-config";
import { AltchaWidget, type AltchaWidgetRef } from "@/components/altcha-widget";
import { isNative, isAndroid } from "@/lib/capacitor/platform";

function LoginForm() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [loginMethod, setLoginMethod] = useState<'passkey' | 'password'>('passkey');
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [webAuthnSupported, setWebAuthnSupported] = useState<boolean | null>(null);
  const [altchaPayload, setAltchaPayload] = useState<string | null>(null);
  const altchaRef = useRef<AltchaWidgetRef | null>(null);

  useEffect(() => {
    // Android & iOS native WebAuthn is shimmed by CapacitorPasskey — always supported
    if (isNative) {
      setWebAuthnSupported(true);
      return;
    }

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
    if (webAuthnSupported === false) {
      setLoginMethod('password');
    }
  }, [webAuthnSupported]);

  useEffect(() => {
    const error = searchParams.get('error');
    if (error) {
      let description = "An unknown error occurred.";
      if (error === 'google_denied') description = "Google authentication was denied.";
      if (error === 'apple_denied') description = "Apple authentication was denied.";
      if (error === 'no_code') description = "No authorization code provided.";
      if (error === 'invalid_state') description = "Security state mismatch. Please try again.";
      if (error === 'sso_misconfigured') description = "SSO is misconfigured on the server.";
      if (error === 'token_exchange_failed') description = "Failed to exchange authorization code.";
      if (error === 'userinfo_failed') description = "Failed to retrieve user information.";
      if (error === 'sso_failed') description = "Authentication failed. Please try again.";
      if (error === 'too_many_attempts') description = "Too many attempts. Please try again later.";

      toast({
        variant: "destructive",
        title: "Sign In Error",
        description,
      });
      router.replace('/login', { scroll: false });
    }
  }, [searchParams, router, toast]);

  async function handleLogin() {
    setIsLoading(true);
    try {
      const options = await loginUserAction();
      
      const { getPrfSaltBytes } = await import('@/lib/crypto');
      const prfSalt = await getPrfSaltBytes();

      // Convert Uint8Array to base64url string so it can survive Capacitor's JSON bridge
      const prfSaltBase64url = btoa(String.fromCharCode(...Array.from(prfSalt)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

      const optionsWithPrf = {
        ...options,
        extensions: {
          ...options.extensions,
          prf: {
            eval: {
              /**
               * ⚠️ DUAL-PLATFORM COMPATIBILITY CONSTRAINT:
               * - Capacitor Native Bridge: iOS/Android native shims require a pure, JSON-serializable
               *   base64url string (`prfSaltBase64url`) because WebAuthn is shimmed over a native bridge
               *   that throws an exception when serializing raw binary/Uint8Arrays.
               * - Web Browsers (Safari / Chrome): Strict standard WebAuthn requires a raw binary
               *   Uint8Array (BufferSource) for `eval.first` and instantly throws a `TypeError: Type error`
               *   if a string is passed.
               */
              first: isNative ? prfSaltBase64url : (prfSalt as any),
            },
          },
        },
      };

      const { authenticatePasskey } = await import('@/lib/auth/passkey-platform');
      const authResponse = await authenticatePasskey(optionsWithPrf, isNative);

      const loginResult = await finishLoginAction(authResponse as any);
      const loggedInUserId = loginResult?.userId;

      try {
        const { hasAnyKeys, derivePrfWrappingKey, decryptAndRestoreVault, sessionVaultKey } = await import('@/lib/crypto');
        const { getPrfVaultAction } = await import('@/lib/actions/key-vault-actions');

        // @ts-expect-error — PRF extension results type not yet in @simplewebauthn/browser types
        const rawPrf = authResponse.clientExtensionResults?.prf?.results?.first;
        const prfOutput = rawPrf instanceof ArrayBuffer && rawPrf.byteLength >= 32 ? rawPrf : null;

        if (prfOutput) {
          const wrappingKey = await derivePrfWrappingKey(prfOutput);
          // Stored in memory AND persisted to IndexedDB so background vault
          // sync keeps working across reloads without a new passkey ceremony.
          sessionVaultKey.set(authResponse.id, wrappingKey, loggedInUserId);

          const hadKeys = await hasAnyKeys();
          const vaultData = await getPrfVaultAction(authResponse.id);

          if (vaultData) {
            // Always merge-restore — even when local keys exist, the vault may
            // hold keys created on other devices (and vice versa; the key-sync
            // provider counter-syncs local-only keys back up after login).
            console.log('[auth] PRF vault found, merging...');
            // Decode base64 into an exactly-sized ArrayBuffer. (A Node Buffer's
            // `.buffer` is a shared pool that may be larger than the data and
            // start at a non-zero byteOffset, so `.buffer.slice(0)` would copy
            // the wrong bytes and corrupt decryption — slice by offset instead.)
            const vaultBuf = Buffer.from(vaultData.encryptedVaultBase64, 'base64');
            const encryptedVault = vaultBuf.buffer.slice(
              vaultBuf.byteOffset,
              vaultBuf.byteOffset + vaultBuf.byteLength,
            );

            const result = await decryptAndRestoreVault(wrappingKey, encryptedVault as ArrayBuffer, loggedInUserId);
            console.log(`[auth] E2E key merge complete (${result.imported} imported).`);

            if (result.imported > 0 || !hadKeys) {
              toast({
                title: "Security Synced",
                description: "Your E2E encryption keys have been restored from your passkey.",
              });
            }
          } else if (hadKeys) {
            // Keys exist locally but no vault has been saved for this credential
            // yet — do a one-time initial save so future devices can restore.
            console.log('[auth] Keys present but no vault yet — saving initial PRF vault...');
            try {
              const { encryptVaultWithPrf } = await import('@/lib/crypto');
              const { savePrfVaultAction } = await import('@/lib/actions/key-vault-actions');
              const encrypted = await encryptVaultWithPrf(wrappingKey, loggedInUserId, authResponse.id);
              const b64 = Buffer.from(encrypted).toString('base64');
              await savePrfVaultAction(b64, authResponse.id);
              console.log('[auth] Initial PRF vault saved.');
              toast({
                title: "Key Sync Enabled",
                description: "Your encryption keys are automatically backed up to your passkey.",
              });
            } catch (vaultErr) {
              console.warn('[auth] Initial vault save failed (non-fatal):', vaultErr);
            }
          } else {
            console.log('[auth] No PRF vault found for this credential. New device?');
          }
        } else {
          console.warn('[auth] Authenticator did not provide a valid PRF output. Cannot auto-recover keys.');
        }
      } catch (cryptoErr) {
        console.error('[auth] PRF recovery failed:', cryptoErr);
      }

      toast({
        title: "Welcome Back",
        description: "You have been logged in successfully.",
      });

      const returnTo = searchParams.get('callbackUrl') || searchParams.get('returnTo');
      router.push(returnTo || "/your-comms");
    } catch (error: unknown) {
      console.error("Login failed:", error);

      const errObj = error instanceof Error ? error : null;
      if (errObj?.name === 'NotAllowedError' || errObj?.message?.includes('timed out or was not allowed')) {
        toast({
          title: "Sign In Cancelled",
          description: "Passkey authentication was cancelled. You can try again when you're ready.",
        });
        return;
      }

      const errMsg = errObj?.message || '';

      // Surface rate-limit and other server-side errors clearly to the user
      if (errMsg.includes('Rate limit') || errMsg.includes('rate limit')) {
        toast({
          variant: "destructive",
          title: "Too Many Attempts",
          description: errMsg,
        });
        return;
      }

      // Surface server action version mismatch (stale deployment)
      if (errMsg.includes('Server Action') || errMsg.includes('older or newer deployment')) {
        toast({
          variant: "destructive",
          title: "App Update Required",
          description: "The app is out of date. Please close and reopen the app to get the latest version.",
        });
        return;
      }

      toast({
        variant: "destructive",
        title: "Login Failed",
        description: errMsg || "Passkey authentication failed. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  const [requiresTotp, setRequiresTotp] = useState(false);
  const [totpChallengeToken, setTotpChallengeToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");

  async function handleTotpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!totpCode.trim() || !totpChallengeToken) return;

    setIsLoading(true);
    try {
      const result = await verifyTotpAndLoginAction(totpChallengeToken, totpCode);

      if ('error' in result) {
        toast({
          variant: "destructive",
          title: "Verification Failed",
          description: result.error,
        });
        setIsLoading(false);
        return;
      }

      try {
        const { getOrCreateJournalKey } = await import('@/lib/crypto/journal-encryption');
        await getOrCreateJournalKey();
      } catch (cryptoErr) {
        console.error('[auth] Failed to initialize local E2E key store:', cryptoErr);
      }

      toast({
        title: "Welcome Back",
        description: "You have been logged in successfully.",
      });

      const returnTo = searchParams.get('callbackUrl') || searchParams.get('returnTo');
      router.push(returnTo || "/your-comms");
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err?.message || "An unexpected error occurred.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!emailOrUsername.trim() || !password) return;

    setIsLoading(true);
    try {
      const result = await loginWithPasswordAction(
        emailOrUsername,
        password,
        undefined,
        altchaPayload ?? undefined
      );

      if ('error' in result) {
        toast({
          variant: "destructive",
          title: "Login Failed",
          description: result.error,
        });
        altchaRef.current?.reset();
        setAltchaPayload(null);
        setIsLoading(false);
        return;
      }

      if ('requiresTotp' in result && result.requiresTotp) {
        setRequiresTotp(true);
        setTotpChallengeToken(result.challengeToken);
        setIsLoading(false);
        return;
      }

      try {
        const { getOrCreateJournalKey } = await import('@/lib/crypto/journal-encryption');
        await getOrCreateJournalKey();
      } catch (cryptoErr) {
        console.error('[auth] Failed to initialize local E2E key store:', cryptoErr);
      }

      toast({
        title: "Welcome Back",
        description: "You have been logged in successfully.",
      });

      const returnTo = searchParams.get('callbackUrl') || searchParams.get('returnTo');
      router.push(returnTo || "/your-comms");
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err?.message || "An unexpected error occurred.",
      });
      altchaRef.current?.reset();
      setAltchaPayload(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDevLogin(role: 'admin' | 'member' | 'speaker' | 'free') {
    setIsLoading(true);
    try {
      const { devLoginAction } = await import('@/lib/dev-auth-actions');
      await devLoginAction(role);
      toast({
        title: "Developer Bypass",
        description: `Logged in via local development bypass (${role}).`,
      });
      const returnTo = searchParams.get('callbackUrl') || searchParams.get('returnTo');
      router.push(returnTo || "/your-comms");
    } catch (error: unknown) {
      console.error("Dev login failed:", error);
      toast({
        variant: "destructive",
        title: "Dev Login Failed",
        description: ((error instanceof Error) ? error.message : 'An error occurred') || "Could not bypass login.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  const renderBackgroundWrapper = (content: React.ReactNode) => (
    <div className="flex min-h-screen w-full flex-col items-center justify-start sm:justify-center bg-background text-foreground px-4 py-6 sm:py-8 overflow-y-auto">
      {content}

      {/* Developer testing bypass options positioned cleanly below the card */}
      {process.env.NODE_ENV === "development" && !requiresTotp && (
        <div className="w-full max-w-md mt-6 p-4 bg-muted/40 border border-dashed border-border rounded-xl space-y-3">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block text-center font-mono">
            Automated Testing Sandbox
          </span>
          <div className="grid grid-cols-2 gap-2">
            <Button 
              variant="outline" 
              onClick={() => handleDevLogin('dustin' as any)}
              className="bg-background hover:bg-accent font-mono text-[10px] h-9 tracking-wider rounded-lg border border-border"
              disabled={isLoading}
            >
              👑 Dustin (Founder)
            </Button>
            <Button 
              variant="outline" 
              onClick={() => handleDevLogin('admin')}
              className="bg-background hover:bg-accent font-mono text-[10px] h-9 tracking-wider rounded-lg border border-border"
              disabled={isLoading}
            >
              ⚠️ Test Admin
            </Button>
            <Button 
              variant="outline" 
              onClick={() => handleDevLogin('member')}
              className="bg-background hover:bg-accent font-mono text-[10px] h-9 tracking-wider rounded-lg border border-border"
              disabled={isLoading}
            >
              🔬 Test Member
            </Button>
            <Button 
              variant="outline" 
              onClick={() => handleDevLogin('speaker')}
              className="bg-background hover:bg-accent font-mono text-[10px] h-9 tracking-wider rounded-lg border border-border"
              disabled={isLoading}
            >
              🗣️ Speaker Sam
            </Button>
          </div>
          <Button 
            variant="outline" 
            onClick={() => handleDevLogin('free')}
            className="w-full bg-background hover:bg-accent font-mono text-[10px] h-9 tracking-wider rounded-lg border border-border"
            disabled={isLoading}
          >
            👤 Free Explorer User
          </Button>
        </div>
      )}
    </div>
  );

  if (requiresTotp) {
    return renderBackgroundWrapper(
      <Card className="w-full max-w-md shadow-2xl border border-border/80 bg-card text-card-foreground">
        <CardHeader className="space-y-2 text-center pt-8">
          <div className="flex justify-center mb-4 text-primary">
            <AppLogo width={64} height={64} />
          </div>
          <CardTitle className="text-2xl font-bold font-mono tracking-tight">Two-Factor Auth</CardTitle>
          <CardDescription>Enter the 6-digit verification code from your authenticator app</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 py-4 px-6">
          <form onSubmit={handleTotpSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="totp-code" className="text-xs font-semibold tracking-wider uppercase font-mono text-muted-foreground">Verification Code</Label>
              <Input
                id="totp-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                required
                disabled={isLoading}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                className="h-12 text-center text-2xl tracking-[0.5em] font-mono bg-background border-input focus-visible:ring-primary rounded-xl"
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading || totpCode.length !== 6}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base shadow-sm rounded-xl"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <KeyRound className="mr-2 h-5 w-5" />
              )}
              Verify & Sign In
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center pb-8 pt-4 border-t border-border/40">
          <button
            onClick={() => {
              setRequiresTotp(false);
              setTotpChallengeToken(null);
              setTotpCode("");
            }}
            className="text-xs text-primary hover:text-primary/80 hover:underline transition-colors font-semibold font-mono"
          >
            Cancel & Return to Login
          </button>
        </CardFooter>
      </Card>
    );
  }

  return renderBackgroundWrapper(
    <Card className="w-full max-w-md shadow-2xl border border-border/80 bg-card text-card-foreground">
      <CardHeader className="space-y-1.5 text-center pt-5 sm:pt-8 px-5 sm:px-6">
        <div className="flex justify-center mb-2 sm:mb-4 text-primary">
          <AppLogo width={48} height={48} className="sm:w-16 sm:h-16" />
        </div>
        <CardTitle className="text-xl sm:text-2xl font-bold font-mono tracking-tight">Tribes Login</CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          {loginMethod === 'passkey' ? "Authentication via biometric secure enclave" : "Sign in using username & password"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 py-3 px-5 sm:py-4 sm:px-6">
        {loginMethod === 'password' ? (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email-or-username" className="text-xs font-semibold tracking-wider uppercase font-mono text-muted-foreground">Email or Username</Label>
              <Input
                id="email-or-username"
                type="text"
                placeholder="you@example.com or username"
                required
                disabled={isLoading}
                value={emailOrUsername}
                onChange={(e) => setEmailOrUsername(e.target.value)}
                className="h-11 bg-background border-input focus-visible:ring-primary rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-semibold tracking-wider uppercase font-mono text-muted-foreground">Password</Label>
              <Input
                id="password"
                type="password"
                required
                disabled={isLoading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 bg-background border-input focus-visible:ring-primary rounded-xl"
              />
              <div className="flex justify-end">
                <Link href="/forgot-password" className="text-xs font-semibold text-primary hover:text-primary/80 hover:underline py-1">
                  Forgot Password?
                </Link>
              </div>
            </div>

            {/* ALTCHA Widget */}
            {!isNative && (
              <div className="w-full py-1">
                <AltchaWidget
                  ref={altchaRef}
                  onVerified={setAltchaPayload}
                  onExpired={() => setAltchaPayload(null)}
                />
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading || !emailOrUsername.trim() || !password}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base shadow-sm rounded-xl"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <KeyRound className="mr-2 h-5 w-5" />
              )}
              Sign In
            </Button>
          </form>
        ) : (
          <div className="space-y-4 py-2">
            <Button 
              onClick={handleLogin}
              disabled={isLoading || webAuthnSupported === false}
              className="w-full h-14 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base shadow-sm group transition-all rounded-xl"
            >
              {isLoading ? (
                <Loader2 className="mr-3 h-6 w-6 animate-spin" />
              ) : (
                <Fingerprint className="mr-3 h-6 w-6 group-hover:scale-105 transition-transform" />
              )}
              Sign in with Passkey
            </Button>
          </div>
        )}
        
        {/* Subtle Theme-friendly Partition Line */}
        <div className="relative flex items-center justify-center my-6">
          <span className="absolute inset-x-0 h-px bg-border" />
          <span className="relative bg-card px-3 text-[10px] uppercase tracking-wider text-muted-foreground font-bold font-mono">
            Or continue with
          </span>
        </div>

        {/* Side-by-Side SSO Options */}
        <div className="grid grid-cols-2 gap-3">
          <Button 
            variant="outline" 
            className="h-11 border-border bg-background hover:bg-accent text-foreground flex items-center justify-center gap-2 rounded-xl text-xs font-semibold"
            disabled={isLoading}
            onClick={() => {
              const url = new URL('/api/auth/google', window.location.origin);
              const invite = searchParams.get('invite');
              if (invite) url.searchParams.set('invite', invite);
              window.location.href = url.toString();
            }}
          >
            <Mail className="h-4 w-4 text-muted-foreground" />
            Google
          </Button>

          <Button 
            variant="outline" 
            className="h-11 border-border bg-background hover:bg-accent text-foreground flex items-center justify-center gap-2 rounded-xl text-xs font-semibold"
            disabled={isLoading}
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
                      inviteCode: searchParams.get('invite'),
                    }),
                  });

                  if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || 'Apple sign-in failed');
                  }

                  const returnTo = searchParams.get('callbackUrl') || searchParams.get('returnTo');
                  router.push(returnTo || '/your-comms');
                } catch (err: any) {
                  if (err?.message?.includes('cancelled') || err?.code === '1001') return;
                  console.error('[Apple Native] Error:', err);
                  toast({
                    variant: 'destructive',
                    title: 'Sign In Error',
                    description: err?.message || 'Apple authentication failed. Please try again.',
                  });
                }
              } else {
                const url = new URL('/api/auth/apple', window.location.origin);
                const invite = searchParams.get('invite');
                if (invite) url.searchParams.set('invite', invite);
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
      </CardContent>
      <CardFooter className="flex flex-col gap-3 border-t border-border/40 pt-4 pb-6 sm:pt-6 sm:pb-8 bg-muted/20 px-5 sm:px-6">
        {/* Accessible theme-compliant state toggle */}
        {isAuthMethodEnabled('password') && webAuthnSupported !== false && (
          <button
            type="button"
            onClick={() => setLoginMethod(loginMethod === 'passkey' ? 'password' : 'passkey')}
            className="text-sm font-bold text-primary hover:text-primary/80 hover:underline transition-colors mt-1"
          >
            {loginMethod === 'passkey' ? "I use a password" : "I use a passkey"}
          </button>
        )}

        <p className="text-center text-sm text-muted-foreground font-medium">
          Don&apos;t have an account?{" "}
          <Link href={(() => {
            const parts: string[] = [];
            const invite = searchParams.get('invite');
            const returnTo = searchParams.get('returnTo');
            if (invite) parts.push(`invite=${encodeURIComponent(invite)}`);
            if (returnTo) parts.push(`returnTo=${encodeURIComponent(returnTo)}`);
            return parts.length ? `/signup?${parts.join('&')}` : '/signup';
          })()} className="font-bold text-primary hover:text-primary/80 hover:underline transition-colors">
            Sign Up
          </Link>
        </p>
        <p className="text-center text-[10px] text-muted-foreground font-medium tracking-wide">
          By signing in, you agree to our{" "}
          <Link href="/terms" className="underline hover:text-foreground transition-colors">Terms of Service</Link>
          {" "}and{" "}
          <Link href="/privacy" className="underline hover:text-foreground transition-colors">Privacy Policy</Link>.
        </p>

        {/* Bottom safe area spacer for native Android/iOS system navigation bar */}
        <div className="h-[env(safe-area-inset-bottom,16px)]" />
      </CardFooter>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
