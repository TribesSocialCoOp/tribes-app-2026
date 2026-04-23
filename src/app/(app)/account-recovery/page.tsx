'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Undo2, Loader2, CheckCircle } from 'lucide-react';
import { cancelMyAccountDeletion, getMyDeletionStatus } from '@/lib/actions/profile-actions';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';

export default function AccountRecoveryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [status, setStatus] = useState<{
    isPending: boolean;
    scheduledPurgeDate: string | null;
    daysRemaining: number | null;
  } | null>(null);
  const [isCancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    getMyDeletionStatus().then((s) => {
      setStatus({
        isPending: s.isPending,
        scheduledPurgeDate: s.scheduledPurgeDate?.toISOString() ?? null,
        daysRemaining: s.daysRemaining,
      });
    }).catch(() => {
      // If we can't get status, redirect to login
      router.push('/login');
    });
  }, [router]);

  async function handleCancel() {
    setCancelling(true);
    try {
      await cancelMyAccountDeletion();
      setCancelled(true);
      toast({ title: 'Account Restored!', description: 'Your account deletion has been cancelled.' });
      setTimeout(() => router.push('/your-comms'), 1500);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to cancel deletion.' });
      setCancelling(false);
    }
  }

  if (!status) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const purgeDate = status.scheduledPurgeDate
    ? new Date(status.scheduledPurgeDate).toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })
    : 'unknown';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <div className="mb-8">
        <Image
          src="/_next/static/media/TribesLogo.png"
          alt="Tribes.app"
          width={80}
          height={80}
          className="mx-auto"
          priority
        />
      </div>

      <Card className="max-w-md w-full shadow-xl border-destructive/30">
        <CardHeader className="text-center">
          {cancelled ? (
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
          ) : (
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-3" />
          )}
          <CardTitle className="text-2xl">
            {cancelled ? 'Account Restored!' : 'Account Scheduled for Deletion'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {cancelled ? (
            <p className="text-muted-foreground">
              Your account is active again. Redirecting...
            </p>
          ) : (
            <>
              <p className="text-muted-foreground">
                Your account is scheduled for permanent deletion on{' '}
                <strong className="text-foreground">{purgeDate}</strong>.
              </p>
              {status.daysRemaining !== null && (
                <p className="text-sm text-destructive font-medium">
                  {status.daysRemaining} day{status.daysRemaining !== 1 ? 's' : ''} remaining
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                After this date, all your data will be permanently removed and cannot be recovered.
                Cancel now to restore your account.
              </p>
              <Button
                className="w-full"
                size="lg"
                onClick={handleCancel}
                disabled={isCancelling}
              >
                {isCancelling ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Undo2 className="mr-2 h-5 w-5" />
                )}
                {isCancelling ? 'Restoring...' : 'Cancel Deletion & Restore Account'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
