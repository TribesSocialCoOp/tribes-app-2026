"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Bell, BellRing, Loader2, Smartphone } from "lucide-react";
import { usePushNotifications } from '@/hooks/use-push-notifications';


export interface NotifPrefsState {
  pushEnabled: boolean;
  emailEnabled: boolean;
  mentionsEnabled: boolean;
  bondMessagesEnabled: boolean;
  tribeActivityEnabled: boolean;
  eventRemindersEnabled: boolean;
}

interface NotificationsSectionProps {
  notifPrefs: NotifPrefsState;
  setNotifPrefs: React.Dispatch<React.SetStateAction<NotifPrefsState>>;
  isSaving: boolean;
  onSave: () => void;
}

function NotifToggle({ id, label, description, checked, onChange, disabled }: {
  id: string; label: string; description: string;
  checked: boolean; onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 p-3 rounded-md border hover:bg-muted/50 ${disabled ? 'opacity-50' : ''}`}>
      <div className="min-w-0 flex-1">
        <Label htmlFor={id} className="cursor-pointer">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} className="shrink-0" />
    </div>
  );
}

export function NotificationsSection({ notifPrefs, setNotifPrefs, isSaving, onSave }: NotificationsSectionProps) {
  const {
    isSupported,
    isSubscribed,
    isLoading: isPushLoading,
    permission,
    subscribe,
    unsubscribe,
  } = usePushNotifications();

  async function handlePushToggle() {
    if (isSubscribed) {
      await unsubscribe();
      setNotifPrefs(p => ({ ...p, pushEnabled: false }));
    } else {
      await subscribe();
      setNotifPrefs(p => ({ ...p, pushEnabled: true }));
    }
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center space-x-3">
          <Bell className="h-7 w-7 text-primary" />
          <CardTitle className="text-xl">Notifications</CardTitle>
        </div>
        <CardDescription>Manage how you receive notifications.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* ── Push Notification Registration ───────────────── */}
        {isSupported && (
          <div className="flex items-center justify-between gap-3 p-3 rounded-md border border-primary/30 bg-primary/5">
            <div className="min-w-0 flex-1">
              <Label className="font-semibold flex items-center gap-2">
                <Smartphone className="h-4 w-4" /> Browser Push Notifications
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                {permission === 'denied'
                  ? 'Notifications are blocked by your browser. Update your browser settings to enable.'
                  : isSubscribed
                    ? 'You will receive push notifications for activity on Tribes.app.'
                    : 'Enable push notifications to stay updated even when the app is in the background.'
                }
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isSubscribed && (
                <Badge variant="default" className="bg-green-600 text-white text-xs">
                  <BellRing className="h-3 w-3 mr-1" /> Active
                </Badge>
              )}
              <Button
                variant={isSubscribed ? 'outline' : 'default'}
                size="sm"
                onClick={handlePushToggle}
                disabled={isPushLoading || permission === 'denied'}
              >
                {isPushLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : isSubscribed ? 'Disable' : 'Enable'}
              </Button>
            </div>
          </div>
        )}

        {/* ── Channel Toggles ─────────────────────────────── */}
        <NotifToggle id="emailNotifications" label="Email Notifications" description="Receive email digests for important activity"
          checked={notifPrefs.emailEnabled} onChange={(v) => setNotifPrefs(p => ({ ...p, emailEnabled: v }))} />
        <NotifToggle id="tribeMentions" label="Tribe Mentions" description="Alert when someone mentions you in a tribe"
          checked={notifPrefs.mentionsEnabled} onChange={(v) => setNotifPrefs(p => ({ ...p, mentionsEnabled: v }))} />
        <NotifToggle id="bondMessages" label="Bond Messages" description="Notifications for new encrypted messages"
          checked={notifPrefs.bondMessagesEnabled} onChange={(v) => setNotifPrefs(p => ({ ...p, bondMessagesEnabled: v }))} />
        <NotifToggle id="tribeActivity" label="Tribe Activity" description="New posts, join requests, and tribe updates"
          checked={notifPrefs.tribeActivityEnabled} onChange={(v) => setNotifPrefs(p => ({ ...p, tribeActivityEnabled: v }))} />
        <NotifToggle id="eventReminders" label="Event Reminders" description="Upcoming event alerts and RSVP updates"
          checked={notifPrefs.eventRemindersEnabled} onChange={(v) => setNotifPrefs(p => ({ ...p, eventRemindersEnabled: v }))} />
      </CardContent>
      <CardFooter>
        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={onSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save Notification Preferences
        </Button>
      </CardFooter>
    </Card>
  );
}
