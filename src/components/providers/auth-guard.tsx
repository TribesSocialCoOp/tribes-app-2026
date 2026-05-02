"use client";

import React from "react";
import { useUser } from "@/hooks/use-user";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, Loader2, UserPlus, LogIn, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface AuthGuardProps {
  children: React.ReactNode;
  /** Custom message to show when unauthenticated */
  message?: string;
  /** Optional title for the gate card */
  title?: string;
  /** Optional role requirement */
  requiredRole?: 'Admin' | 'Creator' | 'Individual_Coop';
}

/**
 * AuthGuard Component
 * 
 * Prevents unauthenticated users from seeing the protected children.
 * Shows a beautiful "Sign in to continue" gate card instead.
 */
export function AuthGuard({ 
  children, 
  message = "You need an account to access this page.", 
  title = "Sign in to continue",
  requiredRole
}: AuthGuardProps) {
  const { user, isLoading, role } = useUser();
  const pathname = usePathname();

  // 1. Loading state (centered spinner)
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">Verifying session...</p>
      </div>
    );
  }

  // 2. Unauthenticated state (Gate Card)
  if (!user) {
    return (
      <div className="container mx-auto flex items-center justify-center py-12 px-4 min-h-[60vh]">
        <Card className="max-w-md w-full shadow-2xl border-primary/10 bg-card/50 backdrop-blur-sm">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mb-4">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold font-mono tracking-normal">{title}</CardTitle>
            <CardDescription className="text-base mt-2">
              {message}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <Link href={`/login?callbackUrl=${encodeURIComponent(pathname)}`} passHref className="w-full">
              <Button className="w-full text-lg py-6 bg-primary hover:bg-primary/90" size="lg">
                <LogIn className="mr-2 h-5 w-5" /> Log In
              </Button>
            </Link>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">New to Tribes?</span>
              </div>
            </div>
            <Link href="/signup" passHref className="w-full">
              <Button variant="outline" className="w-full text-lg py-6" size="lg">
                <UserPlus className="mr-2 h-5 w-5" /> Create an Account
              </Button>
            </Link>
          </CardContent>
          <CardFooter className="justify-center text-xs text-muted-foreground">
            Your connection is secure and E2E encrypted.
          </CardFooter>
        </Card>
      </div>
    );
  }

  // 3. Unauthorized role state
  if (requiredRole && role !== requiredRole && role !== 'Admin' && role !== 'System') {
    return (
      <div className="container mx-auto flex items-center justify-center py-12 px-4 min-h-[60vh]">
        <Card className="max-w-md w-full shadow-2xl border-destructive/10 bg-card/50 backdrop-blur-sm">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto bg-destructive/10 w-16 h-16 rounded-full flex items-center justify-center mb-4">
              <ShieldAlert className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl font-bold font-mono tracking-normal text-destructive">Access Denied</CardTitle>
            <CardDescription className="text-base mt-2">
              This page requires the <strong>{requiredRole}</strong> role. 
              Your current role is <strong>{role}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4 text-center">
            <p className="text-sm text-muted-foreground">
              If you believe this is an error, please contact support or upgrade your plan.
            </p>
            <Link href="/" passHref className="w-full">
              <Button variant="outline" className="w-full">
                Return Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 4. Authenticated state
  return <>{children}</>;
}
