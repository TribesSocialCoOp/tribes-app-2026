"use client";

import Link from "next/link";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppLogo } from "@/components/icons/app-logo";
import { Loader2, KeyRound, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { resetPasswordAction } from "@/lib/auth-actions";
import { useToast } from "@/hooks/use-toast";

function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { toast } = useToast();

  // Password complexity checks
  const meetsMinLength = password.length >= 12;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumberOrSymbol = /[0-9]/.test(password) || /[!@#$%^&*(),.?":{}|<>]/.test(password);
  const matchesConfirm = password === confirmPassword && confirmPassword.length > 0;

  const isPasswordValid = meetsMinLength && hasUppercase && hasLowercase && hasNumberOrSymbol;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Reset token is missing or invalid.",
      });
      return;
    }
    if (!isPasswordValid) return;
    if (!matchesConfirm) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Passwords do not match.",
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = await resetPasswordAction(token, password);
      if ("error" in res) {
        toast({
          variant: "destructive",
          title: "Reset Failed",
          description: res.error,
        });
      } else {
        setIsSuccess(true);
        toast({
          title: "Password Reset Successfully",
          description: "You can now sign in with your new password.",
        });
      }
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

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4 relative overflow-hidden">
        <Card className="w-full max-w-md border-destructive/20 bg-card/85 backdrop-blur-xl shadow-2xl relative">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-destructive">Invalid or Expired Link</CardTitle>
            <CardDescription className="text-sm text-muted-foreground mt-2">
              This password reset link is invalid, expired, or has already been used. Please request a new link.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col gap-4 border-t pt-8 bg-muted/30">
            <Link href="/forgot-password" className="w-full">
              <Button className="w-full h-11 bg-primary hover:bg-primary/90">Request New Link</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4 relative overflow-hidden">
        {/* Subtle premium background glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

        <Card className="w-full max-w-md border-primary/10 bg-card/80 backdrop-blur-xl shadow-2xl relative">
          <CardHeader className="text-center pb-4">
            <div className="flex justify-center mb-6">
              <AppLogo className="h-12 w-12 text-primary" />
            </div>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-10 w-10 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">Password Reset</CardTitle>
            <CardDescription className="text-sm text-muted-foreground mt-2">
              Your password has been successfully reset.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col gap-4 border-t pt-8 bg-muted/30">
            <Link href="/login" className="w-full">
              <Button className="w-full h-11 bg-primary hover:bg-primary/90 font-bold">Sign In</Button>
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
          <CardTitle className="text-2xl font-bold tracking-tight">Create New Password</CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-1">
            Choose a strong, secure password for your account.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                required
                disabled={isLoading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 border-primary/20 focus-visible:ring-primary bg-background/50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                required
                disabled={isLoading}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-11 border-primary/20 focus-visible:ring-primary bg-background/50"
              />
            </div>

            {/* Real-time complexity feedback */}
            <div className="p-4 bg-muted/40 rounded-xl border border-border/50 space-y-2 text-xs">
              <span className="font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Complexity Requirements</span>
              <div className="flex items-center gap-2">
                {meetsMinLength ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                )}
                <span className={meetsMinLength ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-muted-foreground"}>
                  At least 12 characters
                </span>
              </div>
              <div className="flex items-center gap-2">
                {hasUppercase ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                )}
                <span className={hasUppercase ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-muted-foreground"}>
                  At least one uppercase letter
                </span>
              </div>
              <div className="flex items-center gap-2">
                {hasLowercase ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                )}
                <span className={hasLowercase ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-muted-foreground"}>
                  At least one lowercase letter
                </span>
              </div>
              <div className="flex items-center gap-2">
                {hasNumberOrSymbol ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                )}
                <span className={hasNumberOrSymbol ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-muted-foreground"}>
                  At least one number or symbol
                </span>
              </div>
              {confirmPassword.length > 0 && (
                <div className="flex items-center gap-2 pt-1 border-t border-border/40 mt-1">
                  {matchesConfirm ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive shrink-0" />
                  )}
                  <span className={matchesConfirm ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-destructive font-medium"}>
                    {matchesConfirm ? "Passwords match" : "Passwords do not match"}
                  </span>
                </div>
              )}
            </div>

            <Button
              type="submit"
              disabled={isLoading || !isPasswordValid || !matchesConfirm}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-base"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <KeyRound className="mr-2 h-5 w-5" />
              )}
              Reset Password
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
