'use client';

import React, { useState } from 'react';
import { AlertTriangle, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { resendVerificationEmailAction } from '@/lib/auth-actions';

export function EmailVerificationBanner() {
  const { user } = useUser();
  const { toast } = useToast();
  const [isSending, setIsSending] = useState(false);

  // Only render if user is authenticated, has an email, and email is NOT verified
  if (!user || !user.email || user.emailVerified) {
    return null;
  }

  const handleResend = async () => {
    setIsSending(true);
    try {
      const res = await resendVerificationEmailAction();
      if (res.error) {
        toast({
          variant: 'destructive',
          title: 'Resend Failed',
          description: res.error,
        });
      } else {
        toast({
          title: 'Verification Sent',
          description: 'A fresh verification link has been sent to your email address.',
        });
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err?.message || 'Failed to send verification email.',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl w-full mb-4 rounded-lg border border-amber-500/25 bg-amber-500/10 dark:bg-amber-950/20 dark:border-amber-500/30 overflow-hidden backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0 animate-pulse" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              Email Verification Required
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 leading-relaxed">
              Your account is currently in <strong>read-only mode</strong>. You can browse, read, and join public tribes, but you must verify your email address to post messages, create tribes, or vote.
            </p>
          </div>
        </div>
        <div className="shrink-0 flex items-center pl-8 sm:pl-0">
          <Button
            size="sm"
            onClick={handleResend}
            disabled={isSending}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs border-none"
          >
            {isSending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-1.5 h-3.5 w-3.5" />
                Resend Link
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
