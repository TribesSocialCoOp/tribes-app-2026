"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { getQRCodeUrl } from '@/lib/utils/qr-code';
import { Loader2, QrCode, Share2, Copy, Check, RefreshCw, X, Handshake, Radio } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  ResponsiveDialog, ResponsiveDialogHeader, ResponsiveDialogTitle,
  ResponsiveDialogDescription, ResponsiveDialogFooter
} from "@/components/ui/responsive-dialog";
import { createBondInviteLink } from '@/lib/actions/bond-actions';
import { isNative } from '@/lib/capacitor/platform';
import { NFCService } from '@/lib/capacitor/nfc-bond';
import { shareContent } from '@/lib/capacitor/share';
import { triggerHaptic } from '@/lib/capacitor/haptics';
import { ImpactStyle } from '@capacitor/haptics';

interface BondQRDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BondQRDialog({
  isOpen,
  onOpenChange,
}: BondQRDialogProps) {
  const { toast } = useToast();
  const [inviteData, setInviteData] = useState<{ url: string; expiresAt: Date } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [nfcSupported, setNfcSupported] = useState(false);
  const [isNfcActive, setIsNfcActive] = useState(false);

  useEffect(() => {
    if (isNative) {
      NFCService.isEnabled().then(setNfcSupported);
    }
  }, []);

  const fetchInvite = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await createBondInviteLink();
      setInviteData(data);
      // Calculate remaining time in seconds
      const seconds = Math.max(0, Math.floor((new Date(data.expiresAt).getTime() - new Date().getTime()) / 1000));
      setTimeLeft(seconds);

      // Auto-initiate NFC if on native with NFC enabled
      if (nfcSupported) {
        handleNfcWrite(data.url);
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to generate bond link', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleNfcWrite = async (url: string) => {
    setIsNfcActive(true);
    const success = await NFCService.writeBondUrl(url);
    if (success) {
      toast({ title: 'NFC Ready', description: 'Tap your phone against the other person\'s device' });
    } else {
      setIsNfcActive(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchInvite();
    } else {
      setInviteData(null);
      setIsNfcActive(false);
    }
  }, [isOpen, fetchInvite]);

  useEffect(() => {
    if (!timeLeft) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCopy = () => {
    if (!inviteData) return;
    triggerHaptic(ImpactStyle.Light);
    navigator.clipboard.writeText(inviteData.url);
    setCopied(true);
    toast({ title: 'Copied', description: 'Link copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!inviteData) return;
    triggerHaptic(ImpactStyle.Medium);
    const shared = await shareContent({
      title: 'Bond with me on Tribes',
      text: 'Scan this or click the link to create a secure cryptographic bond on Tribes.',
      url: inviteData.url,
    });
    
    if (!shared) {
      handleCopy();
    }
  };

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={onOpenChange}>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle className="flex items-center gap-2">
          <QrCode className="h-5 w-5 text-primary" />
          Bond in Person
        </ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          {nfcSupported 
            ? "Tap phones together or scan the code to create an instant bond."
            : "Hold your phones together. The other person should scan this code to create an instant bond."}
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>

      <div className="py-8 flex flex-col items-center space-y-6">
        <div className="relative p-6 bg-white rounded-3xl shadow-2xl shadow-primary/10 border border-primary/5">
          {isLoading ? (
            <div className="h-64 w-64 flex flex-col items-center justify-center gap-3 bg-muted/10 rounded-2xl">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm font-medium text-muted-foreground">Generating secure key...</p>
            </div>
          ) : inviteData && timeLeft > 0 ? (
            <div className="relative group">
                <img 
                  src={getQRCodeUrl(inviteData.url, 256)}
                  alt="Bond QR Code"
                  width={256}
                  height={256}
                  className="rounded-lg shadow-sm"
                />
                {isNfcActive && (
                  <div className="absolute inset-0 bg-primary/10 backdrop-blur-[2px] flex flex-col items-center justify-center rounded-lg animate-pulse border-2 border-primary/50">
                    <Radio className="h-12 w-12 text-primary animate-bounce" />
                    <p className="text-[10px] font-bold text-primary mt-2 uppercase tracking-widest">NFC Active</p>
                  </div>
                )}
            </div>
          ) : (
            <div className="h-64 w-64 flex flex-col items-center justify-center gap-4 bg-destructive/5 rounded-2xl border border-dashed border-destructive/20 p-6 text-center">
              <X className="h-12 w-12 text-destructive/40" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-destructive">Code Expired</p>
                <p className="text-xs text-muted-foreground leading-tight">Bonding keys are short-lived for security.</p>
              </div>
              <Button size="sm" variant="outline" onClick={fetchInvite} className="mt-2">
                <RefreshCw className="mr-2 h-4 w-4" />
                Generate New Code
              </Button>
            </div>
          )}
        </div>

        {inviteData && timeLeft > 0 && (
          <div className="flex flex-col items-center gap-3 w-full max-w-xs">
            <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-bold font-mono">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              EXPIRES IN {formatTime(timeLeft)}
            </div>
            
            <div className="grid grid-cols-2 gap-3 w-full pt-4">
              {nfcSupported ? (
                <Button 
                  variant={isNfcActive ? "default" : "outline"} 
                  onClick={() => handleNfcWrite(inviteData.url)} 
                  className="h-12 rounded-xl group relative overflow-hidden"
                >
                  <Radio className="mr-2 h-4 w-4" />
                  {isNfcActive ? "Tapping..." : "Tap Phones"}
                </Button>
              ) : (
                <Button variant="outline" onClick={handleCopy} className="h-12 rounded-xl group">
                  {copied ? <Check className="mr-2 h-4 w-4 text-green-500" /> : <Copy className="mr-2 h-4 w-4 group-hover:text-primary transition-colors" />}
                  {copied ? "Copied" : "Copy Link"}
                </Button>
              )}
              <Button onClick={handleShare} className="h-12 rounded-xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20">
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </Button>
            </div>
          </div>
        )}
      </div>

      <ResponsiveDialogFooter className="bg-muted/30 -mx-6 -mb-6 p-6 sm:mx-0 sm:mb-0 sm:rounded-b-lg">
         <div className="w-full text-center space-y-1">
            <p className="text-xs font-medium text-foreground flex items-center justify-center gap-1.5">
              <Handshake className="h-3 w-3 text-primary" />
              Secure Cryptographic Key Exchange
            </p>
            <p className="text-[10px] text-muted-foreground">
              This creates a direct end-to-end encrypted relationship.
            </p>
         </div>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
}

