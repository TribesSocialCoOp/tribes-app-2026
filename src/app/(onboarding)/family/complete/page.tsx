
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Loader2, Link2 } from "lucide-react";
import React, { Suspense } from "react";

function CompleteContent() {
  const searchParams = useSearchParams();
  const connectedFamilyMemberName = searchParams.get("name") || "Your family member";
  const count = parseInt(searchParams.get("count") || "0", 10);
  const inviteSent = searchParams.get("invited") === "true";

  return (
    <>
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
        </div>
        <CardTitle className="text-2xl md:text-3xl font-bold font-mono">
          {count > 0 ? 'Introductions Sent!' : inviteSent ? 'Invite Created!' : 'All Done!'}
        </CardTitle>
        <CardDescription className="text-md md:text-lg text-muted-foreground pt-2">
          {count > 0 ? (
            <>
              <span className="font-semibold text-primary">{connectedFamilyMemberName}</span>{' '}
              has been introduced to {count} family member{count > 1 ? 's' : ''}.
              They&apos;ll see the pending bond request{count > 1 ? 's' : ''} when they log in.
            </>
          ) : inviteSent ? (
            <>
              Your family invite link has been created. Share it with people you want to connect with{' '}
              <span className="font-semibold text-primary">{connectedFamilyMemberName}</span>.
            </>
          ) : (
            <>
              <span className="font-semibold text-primary">{connectedFamilyMemberName}</span>{' '}
              is now part of your family network.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center space-y-3">
        <p className="text-muted-foreground">
          You can manage your family connections and bonds from your dashboard.
        </p>
        {inviteSent && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Link2 className="h-4 w-4" />
            <span>Invite link expires in 5 minutes from when it was created.</span>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-col gap-3 pt-6">
        <Button asChild className="w-full" size="lg">
          <Link href="/your-comms">
            Go to Your Intercom
          </Link>
        </Button>
         <Button asChild variant="link" className="text-sm mt-2">
            <Link href="/bonds">Manage Bonds</Link>
        </Button>
      </CardFooter>
    </>
  );
}

export default function FamilyOnboardingCompletePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <CompleteContent />
    </Suspense>
  );
}
