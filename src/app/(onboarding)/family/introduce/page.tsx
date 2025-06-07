
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Send, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function FamilyOnboardingIntroducePage() {
  const connectedFamilyMemberName = "Alex"; // Mock data
  const existingFamilyMembers = [ // Mock data
    { id: "fam1", name: "Mom", avatarFallback: "M" },
    { id: "fam2", name: "Dad", avatarFallback: "D" },
    { id: "fam3", name: "Grandma Sue", avatarFallback: "GS" },
  ];

  return (
    <>
      <CardHeader>
        <Button asChild variant="ghost" size="sm" className="absolute top-4 left-4 text-muted-foreground hover:text-foreground">
          <Link href="/family/start"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Link>
        </Button>
        <CardTitle className="text-2xl md:text-3xl font-bold font-mono text-center pt-8 md:pt-2">Introduce {connectedFamilyMemberName}</CardTitle>
        <CardDescription className="text-md text-muted-foreground text-center pt-1">
          Select existing family members or invite new ones to connect with {connectedFamilyMemberName}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-3 text-foreground">Select Existing Family:</h3>
          <div className="space-y-3">
            {existingFamilyMembers.map((member) => (
              <Label 
                key={member.id} 
                htmlFor={`fam-member-${member.id}`}
                className="flex items-center space-x-3 p-3 border rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <Checkbox id={`fam-member-${member.id}`} className="shrink-0" />
                <Avatar className="h-8 w-8">
                  <AvatarImage src={`https://placehold.co/40x40.png?text=${member.avatarFallback}`} alt={member.name} data-ai-hint="avatar person"/>
                  <AvatarFallback>{member.avatarFallback}</AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium flex-1">
                  {member.name}
                </span>
              </Label>
            ))}
          </div>
        </div>
        <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">Invite New Family Member:</h3>
            <div className="flex items-center space-x-2">
                <UserPlus className="h-5 w-5 text-muted-foreground" />
                <Input type="email" placeholder="Enter email or phone (optional)" className="flex-1"/>
            </div>
            <p className="text-xs text-muted-foreground px-1">You can add multiple new members later.</p>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-3 pt-6">
        <Button asChild className="w-full" size="lg">
          <Link href="/family/complete">
            Send Introductions <Send className="ml-2 h-5 w-5" />
          </Link>
        </Button>
      </CardFooter>
    </>
  );
}
