"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Loader2, Handshake, QrCode } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  ResponsiveDialog, ResponsiveDialogHeader, ResponsiveDialogTitle,
  ResponsiveDialogDescription, ResponsiveDialogFooter
} from "@/components/ui/responsive-dialog";
import { sendBondRequest } from '@/lib/actions/bond-actions';

import { BondQRDialog } from './bond-qr-dialog';

interface BondRequestDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  targetUserId: string;
  targetUserName: string;
  targetUserAvatar?: string;
  onSuccess?: () => void;
}

export function BondRequestDialog({
  isOpen,
  onOpenChange,
  targetUserId,
  targetUserName,
  targetUserAvatar,
  onSuccess,
}: BondRequestDialogProps) {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showQRDialog, setShowQRDialog] = useState(false);
  const { toast } = useToast();

  const handleSend = async () => {
    setIsSending(true);
    try {
      await sendBondRequest(targetUserId, message);
      toast({ title: 'Bond request sent', description: `Your request was sent to ${targetUserName}` });
      onOpenChange(false);
      setMessage("");
      onSuccess?.();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to send bond request', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <ResponsiveDialog open={isOpen} onOpenChange={onOpenChange}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center gap-2">
            <Handshake className="h-5 w-5 text-primary" />
            Request Bond with {targetUserName}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Bonds are private cryptographic relationships. Only people you bond with can see your inner circle posts.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="py-6 space-y-6">
          <div className="flex items-center justify-center">
            <div className="relative">
              <UserAvatar 
                user={{ name: targetUserName, avatar: targetUserAvatar }} 
                className="h-20 w-20 border-4 border-background shadow-xl" 
                fallback={targetUserName.substring(0, 2).toUpperCase()}
              />
              <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground p-1.5 rounded-full shadow-lg border-2 border-background">
                <Handshake className="h-4 w-4" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="bond-message" className="text-sm font-medium text-muted-foreground ml-1">
              Add a personal note (optional)
            </label>
            <Textarea
              id="bond-message"
              placeholder={`Hey ${targetUserName.split(' ')[0]}, I'd like to bond with you on Tribes...`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[100px] resize-none focus-visible:ring-primary/20"
              maxLength={200}
            />
            <p className="text-[10px] text-right text-muted-foreground/60 px-1">
              {message.length}/200 characters
            </p>
          </div>

          <button 
            type="button"
            onClick={() => {
              onOpenChange(false);
              setTimeout(() => setShowQRDialog(true), 300);
            }}
            className="w-full text-left bg-muted/30 hover:bg-muted/50 p-4 rounded-xl border border-border/50 transition-colors group cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-lg group-hover:bg-primary/20 transition-colors">
                <QrCode className="h-5 w-5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="font-medium text-foreground block mb-0.5">Are you in person right now?</span>
                For the strongest cryptographic bond, meet in person and scan each other's QR code instead.
              </p>
            </div>
          </button>
        </div>

        <ResponsiveDialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSending}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={isSending}
            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 flex-1 sm:flex-none"
          >
            {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Handshake className="mr-2 h-4 w-4" />}
            {isSending ? "Sending..." : "Send Request"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialog>

      <BondQRDialog 
        isOpen={showQRDialog} 
        onOpenChange={setShowQRDialog} 
      />
    </>
  );
}
