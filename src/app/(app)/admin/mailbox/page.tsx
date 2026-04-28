"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, RefreshCw, Mail, Loader2, AlertTriangle } from "lucide-react";
import DOMPurify from "isomorphic-dompurify";
import { useToast } from "@/hooks/use-toast";
import { getDevMailboxAction, clearDevMailboxAction } from "@/lib/actions/dev-email-actions";

interface MailboxEntry {
  id: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  sentAt: string;
}

import { AuthGuard } from "@/components/providers/auth-guard";

export default function DevMailboxPage() {
  return (
    <AuthGuard requiredRole="Admin" message="This page is for development and administration only.">
      <DevMailboxContent />
    </AuthGuard>
  );
}

function DevMailboxContent() {
  const [entries, setEntries] = useState<MailboxEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { toast } = useToast();

  // Gate: only in development
  const isDev = process.env.NODE_ENV === 'development';

  const loadMailbox = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getDevMailboxAction();
      setEntries(data);
    } catch {
      toast({ title: 'Error', description: 'Failed to load mailbox', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (isDev) loadMailbox();
  }, [isDev, loadMailbox]);

  const handleClear = async () => {
    try {
      await clearDevMailboxAction();
      setEntries([]);
      toast({ title: 'Mailbox cleared' });
    } catch {
      toast({ title: 'Error', description: 'Failed to clear mailbox', variant: 'destructive' });
    }
  };

  if (!isDev) {
    return (
      <div className="container max-w-4xl mx-auto py-12 px-4">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-amber-500 mb-4" />
            <h2 className="text-lg font-semibold">Dev Only</h2>
            <p className="text-muted-foreground">This page is only available in development mode.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-mono flex items-center gap-3">
            <Mail className="h-8 w-8 text-primary" />
            Dev Mailbox
          </h1>
          <p className="text-muted-foreground mt-1">
            All transactional emails sent in development mode.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadMailbox} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleClear} disabled={entries.length === 0}>
            <Trash2 className="mr-2 h-4 w-4" />
            Clear
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-12 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Mail className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">No emails sent yet.</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Sign up a user or send a bond request to see emails appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <Card key={entry.id} className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base font-medium truncate">
                      {entry.subject}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-3 mt-1">
                      <span>To: <strong>{entry.to}</strong></span>
                      <Badge variant="outline" className="text-xs">
                        {new Date(entry.sentAt).toLocaleTimeString()}
                      </Badge>
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              {expandedId === entry.id && (
                <CardContent className="pt-0">
                  <div className="mt-2 border rounded-lg overflow-hidden bg-white">
                    <div
                      className="p-4"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(entry.html, { USE_PROFILES: { html: true } }) }}
                      style={{ maxHeight: '500px', overflow: 'auto' }}
                    />
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-center text-muted-foreground">
        📧 {entries.length} email{entries.length !== 1 ? 's' : ''} in dev mailbox
        • Max 100 entries retained
      </p>
    </div>
  );
}
