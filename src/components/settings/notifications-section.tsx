"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, Loader2 } from "lucide-react";


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
    <div className={`flex items-center justify-between p-3 rounded-md border hover:bg-muted/50 ${disabled ? 'opacity-50' : ''}`}>
      <div>
        <Label htmlFor={id} className="cursor-pointer">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

export function NotificationsSection({ notifPrefs, setNotifPrefs, isSaving, onSave }: NotificationsSectionProps) {
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
