"use client";

import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useMediaQuery } from '@/hooks/use-media-query';

interface EditBlockDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  block: any | null; // WallBlock
  onSave: (blockId: string, newContent: any) => void;
  onDelete?: (blockId: string) => void;
}

export function EditBlockDialog({
  isOpen,
  onOpenChange,
  block,
  onSave,
  onDelete,
}: EditBlockDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [content, setContent] = useState<any>({});

  useEffect(() => {
    if (block) {
      setContent(block.content);
    }
  }, [block]);

  if (!block) return null;

  const handleSave = () => {
    onSave(block.id, content);
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (onDelete && window.confirm("Are you sure you want to delete this block?")) {
      onDelete(block.id);
      onOpenChange(false);
    }
  };

  const isHtml = block.type === 'html';
  const isMusic = block.type === 'music';
  const isVideo = block.type === 'video';

  const formContent = (
    <div className="py-4 space-y-4">
      <div className="space-y-4 pb-4 border-b">
        <div className="space-y-2">
          <label className="text-sm font-medium">Block Title</label>
          <Input 
            value={content.title ?? ''} 
            onChange={(e) => setContent({ ...content, title: e.target.value })}
            placeholder={isHtml ? 'Custom Block' : isMusic ? 'Music Player' : 'Video Player'}
          />
        </div>
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Show Title</label>
          <Switch 
            checked={content.showTitle !== false} 
            onCheckedChange={(checked) => setContent({ ...content, showTitle: checked })}
          />
        </div>
      </div>
      {isHtml && (
        <div className="space-y-2">
          <label className="text-sm font-medium">HTML Content</label>
          <Textarea 
            value={content.html || ''} 
            onChange={(e) => setContent({ ...content, html: e.target.value })}
            placeholder="<p>Hello world!</p>"
            className="min-h-[150px] font-mono text-sm"
          />
        </div>
      )}
      {isMusic && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Music URL (Spotify, SoundCloud, Apple Music, Tidal, Bandcamp)</label>
          <Input 
            value={content.trackUrl || ''} 
            onChange={(e) => setContent({ ...content, trackUrl: e.target.value })}
            placeholder="https://open.spotify.com/track/..."
          />
        </div>
      )}
      {isVideo && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Video URL (YouTube, Vimeo, MP4)</label>
          <Input 
            value={content.videoUrl || ''} 
            onChange={(e) => setContent({ ...content, videoUrl: e.target.value })}
            placeholder="https://www.youtube.com/watch?v=..."
          />
        </div>
      )}
    </div>
  );

  if (isDesktop) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Block</DialogTitle>
            <DialogDescription>
              Update the content for this block.
            </DialogDescription>
          </DialogHeader>
          {formContent}
          <DialogFooter className="flex justify-between items-center w-full">
            <div className="flex-1">
              {onDelete && (
                <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={handleDelete}>
                  Delete Block
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSave}>Save</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-[10px] sm:max-w-md">
        <SheetHeader className="text-left">
          <SheetTitle>Edit Block</SheetTitle>
          <SheetDescription>
            Update the content for this block.
          </SheetDescription>
        </SheetHeader>
        {formContent}
        <SheetFooter className="mt-4 flex flex-col gap-2">
          <Button onClick={handleSave}>Save Changes</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {onDelete && (
            <Button variant="ghost" className="text-destructive mt-2 hover:bg-destructive/10 hover:text-destructive" onClick={handleDelete}>
              Delete Block
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
