'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Pin, Loader2 } from "lucide-react";
import { pinEncryptedPostToWall } from "@/lib/actions/content-actions";
import { useToast } from "@/hooks/use-toast";

interface PinToWallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: string;
  decryptedContent: string;
  decryptedTitle?: string;
  onSuccess?: () => void;
}

export function PinToWallDialog({
  open,
  onOpenChange,
  postId,
  decryptedContent,
  decryptedTitle,
  onSuccess
}: PinToWallDialogProps) {
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();

  const handleConfirm = async () => {
    setIsPending(true);
    try {
      await pinEncryptedPostToWall(postId, decryptedContent, decryptedTitle);
      toast({
        title: "Pinned to Wall",
        description: "A public copy of this post has been shared to your wall.",
      });
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to pin encrypted post:', error);
      toast({
        title: "Error",
        description: "Failed to pin post to your wall. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-4">
            <Pin className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Share to Your Wall?</DialogTitle>
          <DialogDescription className="text-center pt-2">
            This will create a <strong>public copy</strong> of this post on your wall. 
            Anyone who visits your profile will be able to read it.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-muted-foreground text-center italic">
            The original post stays private and encrypted where it is.
          </p>
        </div>
        <DialogFooter className="sm:justify-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sharing...
              </>
            ) : (
              'Share to Wall'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
