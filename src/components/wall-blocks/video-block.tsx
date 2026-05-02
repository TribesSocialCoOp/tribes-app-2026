
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Video, Edit, AlertTriangle } from "lucide-react";
import { Button } from "../ui/button";
import { getEmbedUrl } from "@/lib/media-embeds";

interface VideoBlockProps {
  content: {
    videoUrl: string;
    title?: string;
    showTitle?: boolean;
  };
  onEdit?: () => void;
}

export default function VideoBlock({ content, onEdit }: VideoBlockProps) {
  const hasVideo = content?.videoUrl?.length > 0;
  const embedUrl = hasVideo ? getEmbedUrl(content.videoUrl) : null;
  const isDirectVideo = embedUrl?.match(/\.(mp4|webm|ogg)$/i);
  const showTitle = content?.showTitle !== false;
  const displayTitle = content?.title || "Video Player";

  return (
    <Card>
      {(showTitle || onEdit) && (
        <CardHeader className={!showTitle ? "pb-0" : ""}>
          <div className={`flex items-center ${showTitle ? "justify-between" : "justify-end"}`}>
              {showTitle && (
                <CardTitle className="flex items-center text-2xl">
                    <Video className="mr-3 h-6 w-6 text-primary"/>
                    {displayTitle}
                </CardTitle>
              )}
               {onEdit && (
                 <Button variant="ghost" size="icon" onClick={onEdit} className={!showTitle ? "-mt-4 -mr-2" : ""}>
                    <Edit className="h-4 w-4"/>
                 </Button>
               )}
          </div>
        </CardHeader>
      )}
      <CardContent>
        {embedUrl ? (
            <div className="aspect-video bg-muted rounded-md overflow-hidden flex items-center justify-center text-muted-foreground border">
                {isDirectVideo ? (
                  <video src={embedUrl} controls className="w-full h-full object-contain bg-black" />
                ) : (
                  <iframe
                      src={embedUrl}
                      width="100%"
                      height="100%"
                      allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                      className="border-0 block"
                      loading="lazy"
                  />
                )}
            </div>
        ) : (
             <div className="p-4 border-2 border-dashed rounded-lg text-center text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2"/>
                <p>No valid video URL provided.</p>
                {onEdit && <Button variant="link" className="mt-1" onClick={onEdit}>Edit block to add a URL</Button>}
            </div>
        )}
      </CardContent>
    </Card>
  );
}
