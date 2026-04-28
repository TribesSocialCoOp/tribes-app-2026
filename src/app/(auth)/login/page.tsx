"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AppLogo } from "@/components/icons/app-logo";
import { Fingerprint, Loader2, Mail } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import { loginUserAction, finishLoginAction } from "@/lib/auth-actions";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

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

      router.push("/your-comms");
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
      router.push("/your-comms");
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
            onClick={() => window.location.href = '/api/auth/google'}
          >
            <Mail className="h-5 w-5" />
            Continue with Google
          </Button>

          {process.env.NODE_ENV === "development" && (
            <div className="pt-4 mt-4 border-t border-dashed border-primary/20 space-y-2">
              <span className="text-xs text-muted-foreground uppercase tracking-widest block text-center mb-2">Automated Testing</span>
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
            <Link href="/signup" className="font-semibold text-primary hover:underline">
              Sign Up
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
