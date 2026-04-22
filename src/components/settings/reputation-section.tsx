import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ShieldCheck } from "lucide-react";
import type { UserProfile } from '@/lib/types';

interface ReputationSectionProps {
  profile: UserProfile;
}

export function ReputationSection({ profile }: ReputationSectionProps) {
  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center space-x-3">
          <ShieldCheck className="h-7 w-7 text-primary" />
          <CardTitle className="text-xl">Reputation &amp; Trust</CardTitle>
        </div>
        <CardDescription>Your community standing, based on positive interactions and adherence to guidelines.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-3 rounded-md border bg-card">
          <div>
            <Label className="text-xs text-muted-foreground">Reputation Status</Label>
            {profile.reputationStatus && (
              <Badge variant={
                profile.reputationStatus === 'Elder' || profile.reputationStatus === 'Veteran' ? 'default' :
                profile.reputationStatus === 'Newcomer' || profile.reputationStatus === 'Onboarding' ? 'outline' :
                'secondary'
              } className="mt-1 block w-fit">
                {profile.reputationStatus}
              </Badge>
            )}
          </div>
          <div className="text-right">
            <Label className="text-xs text-muted-foreground">Score</Label>
            <p className="text-2xl font-bold">{profile.reputationScore || 'N/A'}</p>
          </div>
        </div>
        <div className="px-1">
          <Progress value={profile.reputationScore ? (profile.reputationScore / 1000) * 100 : 0} aria-label={`${profile.reputationScore} out of 1000 reputation score`} />
          <p className="text-xs text-muted-foreground mt-2">
            Your reputation score is a reflection of your interactions across the platform. Positive contributions increase your score, while moderation actions may decrease it.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
