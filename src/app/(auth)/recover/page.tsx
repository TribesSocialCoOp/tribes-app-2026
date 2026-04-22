"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Mail, CheckCircle2 } from "lucide-react";
import { requestPasskeyRecovery } from "@/lib/actions/auth-email-actions";

export default function RecoverPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    try {
      await requestPasskeyRecovery(email);
      setSent(true);
    } catch (err: unknown) {
      // Don't reveal whether the email exists — always show success
      setSent(true);
    } finally {
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-lg shadow-xl">
          <CardHeader className="text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-500 mb-4" />
            <CardTitle className="text-2xl font-bold font-mono">Check Your Email</CardTitle>
            <CardDescription className="text-md pt-2">
              If an account with that email exists, we&apos;ve sent a recovery link.
              It expires in 15 minutes.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Click the link in the email to sign in and register a new passkey.
              If you don&apos;t see it, check your spam folder.
            </p>
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-left">
              <p className="text-sm text-amber-800">
                <strong>Note:</strong> Account recovery restores access to your account.
                However, encrypted message history from your previous device may not be recoverable,
                as encryption keys are stored locally on each device.
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-center pt-4">
            <Button asChild variant="link">
              <Link href="/login">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Login
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl font-bold font-mono">Account Recovery</CardTitle>
          <CardDescription className="text-md pt-1">
            Lost your passkey? Enter your email address and we&apos;ll send you a recovery link.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recover-email">Email Address</Label>
              <Input
                id="recover-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              We&apos;ll send a one-time link that lets you sign in and register a new passkey.
            </p>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" size="lg" disabled={isLoading || !email}>
              {isLoading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Mail className="mr-2 h-5 w-5" />
              )}
              Send Recovery Link
            </Button>
            <Button asChild variant="link" className="text-sm">
              <Link href="/login">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Login
              </Link>
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
