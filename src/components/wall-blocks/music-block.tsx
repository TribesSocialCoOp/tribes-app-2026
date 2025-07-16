
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Music, Edit, AlertTriangle } from "lucide-react";
import { Button } from "../ui/button";

interface MusicBlockProps {
  content: {
    trackUrl: string;
  };
}

export default function MusicBlock({ content }: MusicBlockProps) {
  const hasTrack = content.trackUrl.length > 0;
  return (
    <Card>
      <CardHeader>
         <div className="flex justify-between items-center">
            <CardTitle className="flex items-center text-2xl">
                <Music className="mr-3 h-6 w-6 text-primary"/>
                Music Player
            </CardTitle>
            <Button variant="ghost" size="icon">
                <Edit className="h-4 w-4"/>
            </Button>
        </div>
      </CardHeader>
      <CardContent>
        {hasTrack ? (
            <div className="aspect-video bg-muted rounded-md flex items-center justify-center text-muted-foreground">
                <p>Music player for {content.trackUrl} would be here.</p>
            </div>
        ) : (
            <div className="p-4 border-2 border-dashed rounded-lg text-center text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2"/>
                <p>No track URL provided.</p>
                <Button variant="link" className="mt-1">Edit block to add a URL</Button>
            </div>
        )}
      </CardContent>
    </Card>
  );
}
