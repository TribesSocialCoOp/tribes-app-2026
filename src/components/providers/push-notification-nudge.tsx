'use client';

import React, { useEffect, useState } from 'react';
import { BellRing, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUser } from '@/hooks/use-user';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { isNative } from '@/lib/capacitor/platform';

const DISMISS_KEY = 'tribes:push-nudge-dismissed';

/**
 * Post-login nudge prompting users to enable push notifications.
 *
 * Why this exists: enabling push was buried behind a manual toggle in Settings that
 * almost no one found — production had ~4 subscriptions across 193 users. This surfaces
 * the opt-in at a natural moment (any authenticated app view) on both web and native.
 * The actual enable/disable control still lives at the top of Settings → Notifications;
 * this just drives discovery.
 *
 * Shows only when: authenticated, push is supported on this platform, not already
 * subscribed, permission not hard-denied, and the user hasn't dismissed it before.
 */
export function PushNotificationNudge() {
  const { user } = useUser();
  const { isSupported, isSubscribed, isLoading, permission, subscribe } = usePushNotifications();

  // localStorage is client-only — gate on a mounted flag to avoid hydration mismatch.
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setMounted(true);
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  const handleEnable = async () => {
    const ok = await subscribe();
    // If the user hard-denies at the OS/browser prompt, stop nagging.
    if (!ok && permission === 'denied') handleDismiss();
  };

  if (!mounted || dismissed) return null;
  // Only for authenticated users on a platform that supports push, not yet subscribed,
  // and not already blocked at the OS/browser level (nudging can't fix a hard denial).
  if (!user || !isSupported || isSubscribed || permission === 'denied') return null;

  return (
    <div className="mx-auto max-w-4xl w-full mb-4 rounded-lg border border-primary/25 bg-primary/10 dark:bg-primary/15 overflow-hidden backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4">
        <div className="flex items-start gap-3">
          <BellRing className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Turn on {isNative ? 'push' : 'browser'} notifications
            </p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Get alerted about new messages, mentions, and tribe activity even when Tribes isn&apos;t open.
              You can change this anytime in Settings → Notifications.
            </p>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2 pl-8 sm:pl-0">
          <Button
            size="sm"
            onClick={handleEnable}
            disabled={isLoading}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs border-none"
          >
            {isLoading ? (
              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Enabling…</>
            ) : (
              <><BellRing className="mr-1.5 h-3.5 w-3.5" /> Enable</>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDismiss}
            disabled={isLoading}
            className="text-muted-foreground hover:text-foreground text-xs"
            aria-label="Dismiss notification prompt"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
