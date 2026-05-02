
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Music, Edit, AlertTriangle } from "lucide-react";
import { Button } from "../ui/button";
import { getEmbedUrl } from "@/lib/media-embeds";

interface MusicBlockProps {
  content: {
    trackUrl: string;
    title?: string;
    showTitle?: boolean;
  };
  onEdit?: () => void;
}

export default function MusicBlock({ content, onEdit }: MusicBlockProps) {
  const hasTrack = content?.trackUrl?.length > 0;
  const embedUrl = hasTrack ? getEmbedUrl(content.trackUrl) : null;
  const showTitle = content?.showTitle !== false;
  const displayTitle = content?.title || "Music Player";

  return (
    <Card>
      {(showTitle || onEdit) && (
        <CardHeader className={!showTitle ? "pb-0" : ""}>
           <div className={`flex items-center ${showTitle ? "justify-between" : "justify-end"}`}>
              {showTitle && (
                <CardTitle className="flex items-center text-2xl">
                    <Music className="mr-3 h-6 w-6 text-primary"/>
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
            <div className="rounded-md overflow-hidden bg-muted border">
                <iframe
                    src={embedUrl}
                    width="100%"
                    height={embedUrl.includes('youtube') || embedUrl.includes('vimeo') ? '200' : '152'}
                    allow="autoplay; encrypted-media; fullscreen"
                    className="border-0 block"
                    loading="lazy"
                />
            </div>
        ) : (
            <div className="p-4 border-2 border-dashed rounded-lg text-center text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2"/>
                <p>No valid music track URL provided.</p>
                {onEdit && <Button variant="link" className="mt-1" onClick={onEdit}>Edit block to add a URL</Button>}
            </div>
        )}
      </CardContent>
    </Card>
  );
}
