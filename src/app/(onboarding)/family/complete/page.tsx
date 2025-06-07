
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

export default function FamilyOnboardingCompletePage() {
  const connectedFamilyMemberName = "Alex"; // Mock data

  return (
    <>
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
        </div>
        <CardTitle className="text-2xl md:text-3xl font-bold font-mono">Introductions Sent!</CardTitle>
        <CardDescription className="text-md md:text-lg text-muted-foreground pt-2">
          <span className="font-semibold text-primary">{connectedFamilyMemberName}</span> is now connected with your selected family members.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center">
        <p className="text-muted-foreground">
          You can manage your family connections and bonds from your dashboard.
        </p>
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
