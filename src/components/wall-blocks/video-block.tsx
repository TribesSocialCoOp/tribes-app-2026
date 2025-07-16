
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Video, Edit, AlertTriangle } from "lucide-react";
import { Button } from "../ui/button";

interface VideoBlockProps {
  content: {
    videoUrl: string;
  };
}

export default function VideoBlock({ content }: VideoBlockProps) {
  const hasVideo = content.videoUrl.length > 0;
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
            <CardTitle className="flex items-center text-2xl">
                <Video className="mr-3 h-6 w-6 text-primary"/>
                Video Player
            </CardTitle>
             <Button variant="ghost" size="icon">
                <Edit className="h-4 w-4"/>
            </Button>
        </div>
      </CardHeader>
      <CardContent>
        {hasVideo ? (
            <div className="aspect-video bg-muted rounded-md flex items-center justify-center text-muted-foreground">
                <p>Video player for {content.videoUrl} would be here.</p>
            </div>
        ) : (
             <div className="p-4 border-2 border-dashed rounded-lg text-center text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2"/>
                <p>No video URL provided.</p>
                <Button variant="link" className="mt-1">Edit block to add a URL</Button>
            </div>
        )}
      </CardContent>
    </Card>
  );
}
