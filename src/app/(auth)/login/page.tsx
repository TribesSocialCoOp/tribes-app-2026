"use client";

import Link from "next/link";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AppLogo } from "@/components/icons/app-logo";
import { Fingerprint, Loader2, Mail } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import { loginUserAction, finishLoginAction } from "@/lib/auth-actions";
import { useToast } from "@/hooks/use-toast";

function LoginForm() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

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
      // Clear the error from the URL
      router.replace('/login', { scroll: false });
    }
  }, [searchParams, router, toast]);

  async function handleLogin() {
    setIsLoading(true);
    try {
      // 1. Get authentication options from server
      const options = await loginUserAction();
      
      // 2. Inject the PRF extension client-side.
      // The server cannot include this because the PRF salt must be a real
      // ArrayBuffer/Uint8Array — Node Buffers don't survive JSON serialization.
      const { getPrfSaltBytes } = await import('@/lib/crypto');
      const prfSalt = await getPrfSaltBytes();
      const optionsWithPrf = {
        ...options,
        extensions: {
          ...options.extensions,
          prf: {
            eval: { first: prfSalt },
          },
        },
      };

      // 3. Start biometric authentication in browser
      const authResponse = await startAuthentication({
        optionsJSON: optionsWithPrf,
      });

      // 4. Finish authentication on server
      await finishLoginAction(authResponse);

      // 5. Handle E2E Key Recovery (Phase 3: PRF)
      try {
        const { hasAnyKeys, derivePrfWrappingKey, decryptAndRestoreVault } = await import('@/lib/crypto');
        const { getPrfVaultAction } = await import('@/lib/actions/key-vault-actions');
        
        // If this is a fresh session (no keys in IndexedDB), try to restore
        if (!(await hasAnyKeys())) {
          console.log('[auth] Local keystore empty, attempting PRF recovery...');
          
          // Extract PRF output from assertion
          // @ts-expect-error — PRF extension results type not yet in @simplewebauthn/browser types
          const rawPrf = authResponse.clientExtensionResults?.prf?.results?.first;
          // Validate it is actually an ArrayBuffer of the expected size before use
          const prfOutput = rawPrf instanceof ArrayBuffer && rawPrf.byteLength >= 32 ? rawPrf : null;

          if (prfOutput) {
            // Retrieve encrypted vault for this credential
            const vaultData = await getPrfVaultAction(authResponse.id);
            
            if (vaultData) {
              console.log('[auth] PRF vault found, decrypting...');
              const wrappingKey = await derivePrfWrappingKey(prfOutput);
              
              // Efficiently convert base64 to ArrayBuffer via Buffer (avoids O(n^2) string concat)
              const encryptedVault = Buffer.from(vaultData.encryptedVaultBase64, 'base64').buffer.slice(0);
              
              await decryptAndRestoreVault(wrappingKey, encryptedVault as ArrayBuffer);
              console.log('[auth] E2E keys restored successfully.');
              
              toast({
                title: "Security Synced",
                description: "Your E2E encryption keys have been restored from your passkey.",
              });
            } else {
              console.log('[auth] No PRF vault found for this credential. New device?');
            }
          } else {
            console.warn('[auth] Authenticator did not provide a valid PRF output. Cannot auto-recover keys.');
          }
        }
      } catch (cryptoErr) {
        console.error('[auth] PRF recovery failed:', cryptoErr);
      }

      toast({
        title: "Welcome Back",
        description: "You have been logged in successfully.",
      });

      // Redirect to returnTo (from bond invite, etc.) or default feed
      const returnTo = searchParams.get('callbackUrl') || searchParams.get('returnTo');
      router.push(returnTo || "/your-comms");
    } catch (error: unknown) {
      console.error("Login failed:", error);

      // Handle user cancelling the passkey prompt gracefully
      const errObj = error instanceof Error ? error : null;
      if (errObj?.name === 'NotAllowedError' || errObj?.message?.includes('timed out or was not allowed')) {
        toast({
          title: "Sign In Cancelled",
          description: "Passkey authentication was cancelled. You can try again when you're ready.",
        });
        return; // Don't show the generic error
      }

      // Sanitize error messages — never expose raw browser/server internals to users
      toast({
        variant: "destructive",
        title: "Login Failed",
        description: "Passkey authentication failed. Please try again.",
      });

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center mb-6">
            <AppLogo width={72} height={72} />
          </div>
          <CardTitle className="text-3xl font-bold font-mono text-primary">Tribes Login</CardTitle>
          <CardDescription>Authentication via biometric secure enclave</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 py-6">
          <Button 
            onClick={handleLogin}
            disabled={isLoading}
            className="w-full h-14 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xl group transition-all"
          >
            {isLoading ? (
              <Loader2 className="mr-3 h-6 w-6 animate-spin" />
            ) : (
              <Fingerprint className="mr-3 h-6 w-6 group-hover:scale-110 transition-transform" />
            )}
            Sign in with Passkey
          </Button>
          
          <div className="relative flex items-center justify-center">
            <span className="absolute inset-x-0 h-px bg-muted" />
            <span className="relative bg-background px-4 text-xs text-muted-foreground uppercase tracking-widest">
              Emergency Fallback
            </span>
          </div>

          <Button 
            variant="outline" 
            className="w-full h-12 border-primary/20 hover:bg-primary/5 flex items-center justify-center gap-2"
            disabled={isLoading}
            onClick={() => {
              const url = new URL('/api/auth/google', window.location.origin);
              const invite = searchParams.get('invite');
              if (invite) url.searchParams.set('invite', invite);
              window.location.href = url.toString();
            }}
          >
            <Mail className="h-5 w-5" />
            Continue with Google
          </Button>

          <Button 
            variant="outline" 
            className="w-full h-12 bg-black text-white hover:bg-black/90 border-black flex items-center justify-center gap-2"
            disabled={isLoading}
            onClick={async () => {
              // Detect native iOS → use native Apple Sign-In sheet
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

                  // POST the identity token to our native verification endpoint
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

                  // Session cookie is set via the response — navigate to the app
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
                // Web flow — standard OAuth redirect
                const url = new URL('/api/auth/apple', window.location.origin);
                const invite = searchParams.get('invite');
                if (invite) url.searchParams.set('invite', invite);
                window.location.href = url.toString();
              }
            }}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
            Continue with Apple
          </Button>

          {process.env.NODE_ENV === "development" && (
            <div className="pt-4 mt-4 border-t border-dashed border-primary/20 space-y-2">
              <span className="text-xs text-muted-foreground uppercase tracking-widest block text-center mb-2">Automated Testing</span>
              <Button 
                variant="secondary" 
                onClick={() => handleDevLogin('dustin' as any)}
                className="w-full bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20 border border-indigo-500/30 font-mono tracking-wider text-xs h-10"
                disabled={isLoading}
              >
                🛠️ Login as Dustin (Founder)
              </Button>
              <Button 
                variant="secondary" 
                onClick={() => handleDevLogin('admin')}
                className="w-full bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 border border-orange-500/30 font-mono tracking-wider text-xs h-10"
                disabled={isLoading}
              >
                ⚠️ Login as Test Admin
              </Button>
              <Button 
                variant="secondary" 
                onClick={() => handleDevLogin('member')}
                className="w-full bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border border-blue-500/30 font-mono tracking-wider text-xs h-10"
                disabled={isLoading}
              >
                🔬 Login as Test Member
              </Button>
              <Button 
                variant="secondary" 
                onClick={() => handleDevLogin('speaker')}
                className="w-full bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 border border-purple-500/30 font-mono tracking-wider text-xs h-10"
                disabled={isLoading}
              >
                🗣️ Login as Speaker
              </Button>
              <Button 
                variant="secondary" 
                onClick={() => handleDevLogin('free')}
                className="w-full bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border border-emerald-500/30 font-mono tracking-wider text-xs h-10"
                disabled={isLoading}
              >
                👤 Login as Free User
              </Button>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-4 border-t pt-8 bg-muted/30">
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href={(() => {
              const parts: string[] = [];
              const invite = searchParams.get('invite');
              const returnTo = searchParams.get('returnTo');
              if (invite) parts.push(`invite=${encodeURIComponent(invite)}`);
              if (returnTo) parts.push(`returnTo=${encodeURIComponent(returnTo)}`);
              return parts.length ? `/signup?${parts.join('&')}` : '/signup';
            })()} className="font-semibold text-primary hover:underline">
              Sign Up
            </Link>
          </p>
          <p className="text-center text-xs text-muted-foreground">
            By signing in, you agree to our{" "}
            <Link href="/terms" className="underline hover:text-foreground">Terms of Service</Link>
            {" "}and{" "}
            <Link href="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>.
          </p>
        </CardFooter>
      </Card>
    </div>
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
