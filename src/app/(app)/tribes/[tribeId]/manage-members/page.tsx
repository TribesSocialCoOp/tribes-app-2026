
"use client";

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, UsersRound } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { tribesData, type Tribe } from '../page'; // Assuming tribesData is exported from parent

export default function ManageMembersPage() {
  const router = useRouter();
  const params = useParams();
  const tribeId = params.tribeId as string;
  const [tribe, setTribe] = useState<Tribe | null>(null);

  useEffect(() => {
    if (tribeId) {
      const currentTribe = tribesData.find(t => t.id === tribeId);
      setTribe(currentTribe || null);
    }
  }, [tribeId]);

  if (!tribe) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading tribe information...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to {tribe.name}
        </Button>
      </div>

      <Card className="shadow-xl">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <UsersRound className="h-7 w-7 text-primary" />
            <div>
              <CardTitle className="text-2xl font-semibold tracking-normal">Manage Members</CardTitle>
              <CardDescription>View, assign nicknames, and manage members for {tribe.name}.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Member list and management tools (including nickname assignment) will be displayed here.
          </p>
          <p className="text-muted-foreground mt-2">
            This page is currently a placeholder. Full functionality coming soon!
          </p>
          {/* Placeholder for member list and actions */}
           <div className="mt-6 p-6 border-2 border-dashed rounded-lg text-center">
                <UsersRound className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50"/>
                <p className="text-sm text-muted-foreground">Member management interface under construction.</p>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
