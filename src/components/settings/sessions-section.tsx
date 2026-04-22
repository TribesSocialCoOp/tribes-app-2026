import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Monitor, Smartphone, Globe, Loader2, LogOut } from "lucide-react";

interface Session {
  id: string;
  userAgent: string | null;
  createdAt: Date | null;
  isCurrent: boolean;
}

interface SessionsSectionProps {
  sessions: Session[];
  isLoading: boolean;
  isRevokingSession: string | null;
  onRevoke: (sessionId: string) => void;
  onRevokeAll: () => void;
}

function parseUserAgent(ua: string | null): { device: string; icon: React.ReactNode } {
  if (!ua) return { device: 'Unknown device', icon: <Globe className="h-4 w-4" /> };
  const lower = ua.toLowerCase();
  if (lower.includes('mobile') || lower.includes('android') || lower.includes('iphone')) {
    return { device: 'Mobile', icon: <Smartphone className="h-4 w-4" /> };
  }
  let browser = 'Browser';
  if (lower.includes('chrome') && !lower.includes('edge')) browser = 'Chrome';
  else if (lower.includes('firefox')) browser = 'Firefox';
  else if (lower.includes('safari') && !lower.includes('chrome')) browser = 'Safari';
  else if (lower.includes('edge')) browser = 'Edge';
  let os = '';
  if (lower.includes('mac')) os = 'macOS';
  else if (lower.includes('windows')) os = 'Windows';
  else if (lower.includes('linux')) os = 'Linux';
  return { device: `${browser}${os ? ` on ${os}` : ''}`, icon: <Monitor className="h-4 w-4" /> };
}

export function SessionsSection({ sessions, isLoading, isRevokingSession, onRevoke, onRevokeAll }: SessionsSectionProps) {
  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center space-x-3">
          <Monitor className="h-7 w-7 text-primary" />
          <CardTitle className="text-xl">Active Sessions</CardTitle>
        </div>
        <CardDescription>Manage devices where you&apos;re currently signed in.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
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
              <div key={session.id} className="flex items-center justify-between p-3 rounded-md border hover:bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                    {icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{device}</p>
                      {session.isCurrent && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">This device</Badge>
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
