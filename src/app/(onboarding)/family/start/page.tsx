
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";

export default function FamilyOnboardingStartPage() {
  const connectedFamilyMemberName = "Alex"; // Mock data

  return (
    <>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl md:text-3xl font-bold font-mono">Connection Successful!</CardTitle>
        <CardDescription className="text-md md:text-lg text-muted-foreground pt-2">
          You've successfully connected with <span className="font-semibold text-primary">{connectedFamilyMemberName}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-center">
        <p className="text-muted-foreground">
          Would you like to introduce {connectedFamilyMemberName} to other family members or invite them to your existing Family Hub?
        </p>
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row gap-3 pt-6">
        <Button asChild className="w-full sm:w-auto flex-1" size="lg">
          <Link href="/family/introduce">
            Introduce to Family <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </Button>
        <Button variant="outline" className="w-full sm:w-auto flex-1" size="lg" disabled>
          Add to My Family Hub
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
