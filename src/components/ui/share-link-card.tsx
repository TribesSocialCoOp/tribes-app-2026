"use client";

import React, { useState } from 'react';
import { Check, Copy, Share2, X, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

interface ShareLinkCardProps {
  url: string;
  title: string;
  expiryLabel?: string;
  onDismiss: () => void;
}

/**
 * Reusable share link card with Copy + Share buttons.
 * Used in bonds, tribes, and any surface that generates shareable links.
 */
export function ShareLinkCard({ url, title, expiryLabel, onDismiss }: ShareLinkCardProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast({ title: 'Copied', description: 'Link copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title, url });
    } else {
      handleCopy();
    }
  };

  return (
    <Card className="bg-primary/5 border-primary/20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
      <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Link2 className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate max-w-[200px] sm:max-w-xs">{url}</p>
            {expiryLabel && (
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">{expiryLabel}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button size="sm" variant="outline" onClick={handleCopy} className="flex-1 sm:flex-none h-9 rounded-lg">
            {copied ? <Check className="mr-2 h-3.5 w-3.5 text-green-500" /> : <Copy className="mr-2 h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button
            size="sm"
            onClick={handleShare}
            className="flex-1 sm:flex-none h-9 rounded-lg bg-primary hover:bg-primary/90"
          >
            <Share2 className="mr-2 h-3.5 w-3.5" /> Share
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss} className="h-9 w-9 p-0 rounded-lg">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
