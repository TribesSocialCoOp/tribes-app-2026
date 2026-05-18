"use client";

import Link from "next/link";
import { useState, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppLogo } from "@/components/icons/app-logo";
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { requestPasswordResetAction } from "@/lib/auth-actions";
import { useToast } from "@/hooks/use-toast";
import { TurnstileWidget, type TurnstileWidgetRef } from "@/components/turnstile-widget";

function ForgotPasswordForm() {
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetRef | null>(null);
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!emailOrUsername.trim()) return;

    setIsLoading(true);
    try {
      const res = await requestPasswordResetAction(emailOrUsername, turnstileToken || undefined);
      if ("error" in res) {
        toast({
          variant: "destructive",
          title: "Reset Request Failed",
          description: res.error,
        });
        // Reset turnstile on failure
        turnstileRef.current?.reset();
      } else {
        setIsSubmitted(true);
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err?.message || "An unexpected error occurred.",
      });
      turnstileRef.current?.reset();
    } finally {
      setIsLoading(false);
    }
  }

  if (isSubmitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4 relative overflow-hidden">
        {/* Subtle premium background glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

        <Card className="w-full max-w-md border-primary/10 shadow-2xl relative bg-card/80 backdrop-blur-xl">
          <CardHeader className="text-center pb-4">
            <div className="flex justify-center mb-6">
              <AppLogo className="h-12 w-12 text-primary" />
            </div>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-10 w-10 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">Check Your Inbox</CardTitle>
            <CardDescription className="text-sm text-muted-foreground mt-2">
              If an account is associated with that email or username, we've sent instructions to reset your password.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted/40 rounded-xl border border-border/50 text-xs text-muted-foreground leading-relaxed">
              <p className="font-semibold text-foreground mb-1">Didn't receive the email?</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Check your spam or junk folder</li>
                <li>Make sure the username or email is correct</li>
                <li>Wait a few minutes before requesting again</li>
              </ul>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 border-t pt-8 bg-muted/30">
            <Link href="/login" className="w-full">
              <Button variant="outline" className="w-full h-11 border-primary/20 flex items-center justify-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Login
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Subtle premium background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

      <Card className="w-full max-w-md border-primary/10 shadow-2xl relative bg-card/80 backdrop-blur-xl">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-6">
            <AppLogo className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Forgot Password?</CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-1">
            Enter your email or username and we'll send you a link to reset your password.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email-or-username">Email or Username</Label>
              <Input
                id="email-or-username"
                type="text"
                placeholder="you@example.com or username"
                required
                disabled={isLoading}
                value={emailOrUsername}
                onChange={(e) => setEmailOrUsername(e.target.value)}
                className="h-11 border-primary/20 focus-visible:ring-primary bg-background/50"
              />
            </div>

            {/* Turnstile Widget */}
            <div className="flex justify-center py-2">
              <TurnstileWidget
                ref={turnstileRef}
                onVerified={setTurnstileToken}
                onError={() => setTurnstileToken(null)}
                onExpired={() => setTurnstileToken(null)}
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading || !emailOrUsername.trim()}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-base"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Mail className="mr-2 h-5 w-5" />
              )}
              Send Reset Link
            </Button>
          </CardContent>
        </form>
        <CardFooter className="flex flex-col gap-4 border-t pt-8 bg-muted/30">
          <Link href="/login" className="w-full">
            <Button variant="outline" className="w-full h-11 border-primary/20 flex items-center justify-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Login
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <ForgotPasswordForm />
    </Suspense>
  );
}
