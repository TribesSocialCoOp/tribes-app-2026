
"use client";

import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Code, Music, Video } from 'lucide-react';

interface AddBlockDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAddBlock: (blockType: 'html' | 'music' | 'video') => void;
}

const blockOptions = [
    { type: 'html' as const, label: 'HTML Block', description: 'Add custom HTML content.', icon: Code },
    { type: 'music' as const, label: 'Music Block', description: 'Embed a music player.', icon: Music },
    { type: 'video' as const, label: 'Video Block', description: 'Embed a video player.', icon: Video },
];

export function AddBlockDialog({
  isOpen,
  onOpenChange,
  onAddBlock,
}: AddBlockDialogProps) {

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a New Block</DialogTitle>
          <DialogDescription>
            Choose a new content block to add to your wall.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-3">
          {blockOptions.map(option => (
            <button
                key={option.type}
                onClick={() => onAddBlock(option.type)}
                className="w-full text-left p-3 border rounded-lg hover:bg-accent hover:border-primary transition-all flex items-start space-x-3"
            >
                <option.icon className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                <div>
                    <p className="font-semibold text-foreground">{option.label}</p>
                    <p className="text-sm text-muted-foreground">{option.description}</p>
                </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
