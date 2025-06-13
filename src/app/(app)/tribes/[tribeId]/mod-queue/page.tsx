
"use client";

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, ListChecks } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { tribesData, type Tribe } from '../../page'; // Corrected import path

export default function TribeModQueuePage() {
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
            <ListChecks className="h-7 w-7 text-destructive" />
            <div>
              <CardTitle className="text-2xl font-semibold tracking-normal">Moderation Queue</CardTitle>
              <CardDescription>Review and manage reported content specifically for {tribe.name}.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            The list of reported posts and moderation tools for this tribe will be displayed here.
          </p>
           <p className="text-muted-foreground mt-2">
            This page is currently a placeholder. Full functionality coming soon!
          </p>
          {/* Placeholder for reported content list and actions */}
          <div className="mt-6 p-6 border-2 border-dashed rounded-lg text-center">
                <ListChecks className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50"/>
                <p className="text-sm text-muted-foreground">Tribe-specific moderation queue under construction.</p>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
