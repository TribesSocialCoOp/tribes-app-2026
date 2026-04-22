
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Loader2 } from "lucide-react";
import React, { Suspense } from "react";

function StartContent() {
  const searchParams = useSearchParams();
  const connectedName = searchParams.get("name") || "your new family member";
  const newMemberId = searchParams.get("memberId") || "";

  const introduceHref = `/family/introduce?name=${encodeURIComponent(connectedName)}${newMemberId ? `&memberId=${encodeURIComponent(newMemberId)}` : ''}`;

  return (
    <>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl md:text-3xl font-bold font-mono">Connection Successful!</CardTitle>
        <CardDescription className="text-md md:text-lg text-muted-foreground pt-2">
          You&apos;ve successfully connected with <span className="font-semibold text-primary">{connectedName}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-center">
        <p className="text-muted-foreground">
          Would you like to introduce {connectedName} to other family members or invite new people to your Family Hub?
        </p>
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row gap-3 pt-6">
        <Button asChild className="w-full sm:w-auto flex-1" size="lg">
          <Link href={introduceHref}>
            Introduce to Family <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </Button>
        <Button variant="outline" className="w-full sm:w-auto flex-1" size="lg" asChild>
          <Link href="/bonds">
            View Bonds
          </Link>
        </Button>
      </CardFooter>
      <div className="p-6 pt-2 text-center">
         <Button asChild variant="link" className="text-sm">
            <Link href="/your-comms">Maybe Later</Link>
        </Button>
      </div>
    </>
  );
}

export default function FamilyOnboardingStartPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <StartContent />
    </Suspense>
  );
}
