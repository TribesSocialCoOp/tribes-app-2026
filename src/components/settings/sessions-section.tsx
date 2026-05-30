'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Monitor, Smartphone, Globe, Loader2, LogOut,
  Key, ShieldCheck, Pencil, X, Check, Trash2, Clock,
} from "lucide-react";
import { parseDeviceUA } from '@/lib/utils/device';

// ============================================================
// TYPES
// ============================================================

interface Session {
  id: string;
  userAgent: string | null;
  createdAt: Date | null;
  isCurrent: boolean;
}

interface DeviceKey {
  id: string;
  deviceLabel: string;
  keyFingerprint: string;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string | null;
}

interface SessionsSectionProps {
  sessions: Session[];
  isLoading: boolean;
  isRevokingSession: string | null;
  onRevoke: (sessionId: string) => void;
  onRevokeAll: () => void;
}

// ============================================================
// HELPERS
// ============================================================

function parseUserAgent(ua: string | null): { device: string; icon: React.ReactNode } {
  const parsed = parseDeviceUA(ua);
  const icon = parsed.isMobile
    ? <Smartphone className="h-4 w-4" />
    : parsed.label === 'Unknown Device'
      ? <Globe className="h-4 w-4" />
      : <Monitor className="h-4 w-4" />;
  return { device: parsed.label, icon };
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Unknown';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function truncateFingerprint(fp: string): string {
  if (fp.length <= 12) return fp;
  return `${fp.substring(0, 6)}…${fp.substring(fp.length - 6)}`;
}

function getDeviceIcon(label: string): React.ReactNode {
  // Use the shared parser to detect mobile vs desktop from the stored label
  const lower = label.toLowerCase();
  if (lower.includes('ios') || lower.includes('android')) {
    return <Smartphone className="h-4 w-4" />;
  }
  return <Monitor className="h-4 w-4" />;
}

// ============================================================
// DEVICE KEY ROW
// ============================================================

function DeviceKeyRow({
  device,
  isCurrent,
  onRename,
  onDeactivate,
  isDeactivating,
}: {
  device: DeviceKey;
  isCurrent: boolean;
  onRename: (id: string, newLabel: string) => Promise<void>;
  onDeactivate: (id: string) => Promise<void>;
  isDeactivating: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(device.deviceLabel);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!editLabel.trim() || editLabel === device.deviceLabel) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    try {
      await onRename(device.id, editLabel.trim());
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-md border hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
          {getDeviceIcon(device.deviceLabel)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {isEditing ? (
              <div className="flex items-center gap-1.5">
                <Input
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className="h-7 text-sm w-40"
                  maxLength={100}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave();
                    if (e.key === 'Escape') { setIsEditing(false); setEditLabel(device.deviceLabel); }
                  }}
                  autoFocus
                />
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-green-600" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setIsEditing(false); setEditLabel(device.deviceLabel); }}>
                  <X className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium truncate">{device.deviceLabel}</p>
                <Button variant="ghost" size="icon" className="h-5 w-5 opacity-60 hover:opacity-100" onClick={() => setIsEditing(true)}>
                  <Pencil className="h-3 w-3" />
                </Button>
              </>
            )}
            {isCurrent && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />
                This device
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last seen {formatRelativeTime(device.lastSeenAt)}
            </p>
            <p className="text-xs text-muted-foreground font-mono opacity-60">
              {truncateFingerprint(device.keyFingerprint)}
            </p>
          </div>
        </div>
      </div>
      {!isCurrent && (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => onDeactivate(device.id)}
          disabled={isDeactivating}
        >
          {isDeactivating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Remove
            </>
          )}
        </Button>
      )}
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function SessionsSection({ sessions, isLoading, isRevokingSession, onRevoke, onRevokeAll }: SessionsSectionProps) {
  // Device key state
  const [deviceKeys, setDeviceKeys] = useState<DeviceKey[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [isDeactivatingDevice, setIsDeactivatingDevice] = useState<string | null>(null);
  const [currentFingerprint, setCurrentFingerprint] = useState<string | null>(null);

  // Load device keys on mount
  useEffect(() => {
    loadDeviceKeys();
  }, []);

  const loadDeviceKeys = useCallback(async () => {
    setIsLoadingDevices(true);
    try {
      const { getMyDeviceKeysAction } = await import('@/lib/actions/device-key-actions');
      const keys = await getMyDeviceKeysAction();
      setDeviceKeys(keys);

      // Compute current device fingerprint for "This device" badge
      try {
        const stored = localStorage.getItem('tribes:current-device-fingerprint');
        if (stored) setCurrentFingerprint(stored);
      } catch {
        // Non-critical — badge just won't show
      }
    } catch (err) {
      console.error('[devices] Failed to load device keys:', err);
    } finally {
      setIsLoadingDevices(false);
    }
  }, []);

  const handleRenameDevice = useCallback(async (deviceKeyId: string, newLabel: string) => {
    const { renameDeviceKeyAction } = await import('@/lib/actions/device-key-actions');
    const ok = await renameDeviceKeyAction(deviceKeyId, newLabel);
    if (ok) {
      setDeviceKeys(prev => prev.map(d => d.id === deviceKeyId ? { ...d, deviceLabel: newLabel } : d));
    }
  }, []);

  const handleDeactivateDevice = useCallback(async (deviceKeyId: string) => {
    setIsDeactivatingDevice(deviceKeyId);
    try {
      const { deactivateDeviceKeyAction } = await import('@/lib/actions/device-key-actions');
      const ok = await deactivateDeviceKeyAction(deviceKeyId);
      if (ok) {
        setDeviceKeys(prev => prev.filter(d => d.id !== deviceKeyId));
      }
    } finally {
      setIsDeactivatingDevice(null);
    }
  }, []);

  return (
    <Card className="shadow-lg" id="sessions">
      <CardHeader>
        <div className="flex items-center space-x-3">
          <Monitor className="h-7 w-7 text-primary" />
          <CardTitle className="text-xl">Active Sessions &amp; Devices</CardTitle>
        </div>
        <CardDescription>Manage where you&apos;re signed in and which devices hold your encryption keys.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ── Encryption Devices ── */}
        {(deviceKeys.length > 0 || isLoadingDevices) && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Encryption Devices</h3>
              <Badge variant="outline" className="text-[10px] ml-auto">
                {deviceKeys.length} / 10
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              Devices that can decrypt private tribe content. Removing a device stops new key grants but doesn&apos;t delete existing data.
            </p>
            {isLoadingDevices ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              deviceKeys.map(device => (
                <DeviceKeyRow
                  key={device.id}
                  device={device}
                  isCurrent={currentFingerprint === device.keyFingerprint}
                  onRename={handleRenameDevice}
                  onDeactivate={handleDeactivateDevice}
                  isDeactivating={isDeactivatingDevice === device.id}
                />
              ))
            )}
          </div>
        )}

        {/* ── Auth Sessions ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <LogOut className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Login Sessions</h3>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No active sessions found.</p>
          ) : (
            sessions.map(session => {
              const { device, icon } = parseUserAgent(session.userAgent);
              return (
                <div key={session.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-md border hover:bg-muted/50">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                      {icon}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{device}</p>
                        {session.isCurrent && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">This device</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Signed in {session.createdAt ? new Date(session.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown'}
                      </p>
                    </div>
                  </div>
                  {!session.isCurrent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => onRevoke(session.id)}
                      disabled={isRevokingSession === session.id}
                    >
                      {isRevokingSession === session.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Revoke'
                      )}
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
      {sessions.filter(s => !s.isCurrent).length > 0 && (
        <CardFooter>
          <Button
            variant="outline"
            className="text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={onRevokeAll}
            disabled={isRevokingSession === 'all'}
          >
            {isRevokingSession === 'all' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="mr-2 h-4 w-4" />
            )}
            Sign Out All Other Devices
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
