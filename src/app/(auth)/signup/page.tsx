"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppLogo } from "@/components/icons/app-logo";
import { Fingerprint, Loader2, Mail, Ticket, CheckCircle2 } from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import { registerUserAction, finishRegistrationAction } from "@/lib/auth-actions";
import { validateInviteCode } from '@/lib/actions/profile-actions';
import { getCaptchaChallenge } from '@/lib/actions/auth-actions';
import { useToast } from "@/hooks/use-toast";
import { CaptchaChallenge, HoneypotField } from "@/components/ui/captcha-challenge";

const INVITE_ONLY = process.env.NEXT_PUBLIC_INVITE_ONLY === 'true';

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isInviteValidated, setIsInviteValidated] = useState(!INVITE_ONLY); // skip if not invite-only
  const [invitePlanName, setInvitePlanName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const [captchaChallenge, setCaptchaChallenge] = useState<{ challenge: string; difficulty: number } | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  // Fetch PoW challenge on mount
  useEffect(() => {
    getCaptchaChallenge()
      .then(setCaptchaChallenge)
      .catch(err => console.error('[captcha] Failed to load challenge:', err));
  }, []);

  const handleCaptchaVerify = useCallback((token: string) => {
    setCaptchaToken(token);
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

    // CAPTCHA check
    if (!captchaToken) {
      toast({ variant: 'destructive', title: 'Please wait', description: 'Human verification is still in progress.' });
      return;
    }

    setIsLoading(true);
    try {
      // 1. Get registration options from server
      const { options, userId } = await registerUserAction(name, email);
      
      // 2. Start biometric registration in browser
      const regResponse = await startRegistration({
        optionsJSON: options,
      });

      // 3. Finish registration on server
      await finishRegistrationAction(userId, regResponse);

      toast({
        title: "Account Created!",
        description: "Your passkey has been registered successfully.",
      });

      router.push("/your-comms");
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

      toast({
        variant: "destructive",
        title: "Registration Failed",
        description: ((error instanceof Error) ? error.message : 'An error occurred') || "There was an error creating your account.",
      });
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
                      placeholder="FOUNDING-XXXX"
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

            {/* CAPTCHA + Honeypot */}
            <HoneypotField />
            {captchaChallenge && (
              <CaptchaChallenge
                challenge={captchaChallenge.challenge}
                difficulty={captchaChallenge.difficulty}
                onVerify={handleCaptchaVerify}
              />
            )}
            
            <div className="pt-4 space-y-3">
              <Button 
                type="submit" 
                disabled={isLoading || !name || !email || !captchaToken}
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
                disabled={isLoading}
                onClick={() => window.location.href = '/api/auth/google'}
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
        </CardFooter>
      </Card>
    </div>
  );
}
