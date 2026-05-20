'use client';

import React, { useState, useEffect } from 'react';
import { ShieldAlert, AlertTriangle, CheckCircle, Clock, Trash2, HelpCircle, Eye, AlertCircle, RefreshCw, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getActiveNciiReportsAction, resolveNciiReportAction, fuzzySearchUsername } from '@/lib/actions/content-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

import { useUser } from '@/components/providers/user-provider';
import { getIdentityKey } from '@/lib/crypto/key-store';
import { fromBase64 } from '@/lib/crypto/encoding';

interface NciiReport {
  id: string;
  trackingNumber: string;
  requesterName: string;
  requesterEmail: string;
  requesterSignature: string;
  isDepictedPerson: boolean;
  contentType: 'authentic_ncii' | 'deepfake' | 'minor';
  contentDescription: string;
  contentUrls: string[] | null;
  posterUsername: string | null;
  searchTerms: string | null;
  nonConsentStatement: boolean;
  status: 'pending' | 'in_review' | 'removed' | 'rejected' | 'requires_info';
  actionTaken: 'content_removed' | 'content_not_found' | 'insufficient_info' | 'not_ncii' | null;
  actionNotes: string | null;
  createdAt: Date;
  slaDeadline: Date;
  reviewedAt: Date | null;
  reviewedBy: string | null;

  // Phase 2 enhancements
  hasPreHashes?: boolean;
  autoBlockedCount?: number;
  confirmedCount?: number;
  posterUser?: {
    id: string;
    username: string | null;
    name: string;
    slug: string | null;
  } | null;

  // Phase 3 enhancements
  abuseScore?: number;
  keyGrants?: Array<{
    adminId: string;
    wrappedKey: string;
    wrapIv: string;
  }>;
  encryptedPayload?: string | null;
  encryptionIv?: string | null;
}

function FuzzyMatcher({ username }: { username: string }) {
  const [suggestions, setSuggestions] = useState<Array<{ id: string; username: string | null; name: string; slug: string | null }>>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const clean = username.trim().startsWith('@') ? username.trim().substring(1) : username.trim();
    if (clean.length < 2) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await fuzzySearchUsername(clean);
        if (!cancelled) {
          setSuggestions(res || []);
        }
      } catch (e) {
        console.error('Fuzzy search failed:', e);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setSearched(true);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [username]);

  if (loading) {
    return <span className="text-[10px] text-muted-foreground animate-pulse block mt-1">Finding similar users...</span>;
  }

  if (searched && suggestions.length === 0) {
    return <span className="text-[10px] text-muted-foreground block italic mt-1 text-red-500/80">No similar accounts found on platform.</span>;
  }

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="text-[10px] text-muted-foreground space-y-1 block mt-2 p-2 bg-muted/20 border rounded border-border/50">
      <span className="font-semibold block text-[9px] uppercase tracking-wider text-muted-foreground">Similar Accounts found:</span>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {suggestions.map((user) => (
          <a
            key={user.id}
            href={`/u/${user.slug || user.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors inline-flex items-center gap-1"
          >
            @{user.username || user.name}
          </a>
        ))}
      </div>
    </div>
  );
}

export default function AdminNciiReportsPage() {
  const { toast } = useToast();
  const [reports, setReports] = useState<NciiReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'resolved'>('pending');
  
  // Resolution Dialog State
  const [selectedReport, setSelectedReport] = useState<NciiReport | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [resolutionAction, setResolutionAction] = useState<'content_removed' | 'content_not_found' | 'insufficient_info' | 'not_ncii' | null>(null);

  // Decryption State
  const [decryptedData, setDecryptedData] = useState<Record<string, {
    requesterName: string;
    requesterSignature: string;
    contentDescription: string;
  }>>({});
  const [decryptionStatus, setDecryptionStatus] = useState<Record<string, 'loading' | 'success' | 'failed' | 'no_key'>>({});

  const { user } = useUser();

  const decryptAllReports = async (reportsToDecrypt: NciiReport[], currentUserId: string) => {
    if (!currentUserId) return;
    
    let storedKey: any = null;
    try {
      storedKey = await getIdentityKey(currentUserId);
    } catch (err) {
      console.error('Error fetching identity key from IndexedDB:', err);
    }

    for (const report of reportsToDecrypt) {
      if (!report.encryptedPayload) continue;
      if (decryptedData[report.id]) continue;

      const grant = report.keyGrants?.find((g: any) => g.adminId === currentUserId);
      if (!grant) {
        setDecryptionStatus(prev => ({ ...prev, [report.id]: 'no_key' }));
        continue;
      }

      if (!storedKey?.privateKey) {
        setDecryptionStatus(prev => ({ ...prev, [report.id]: 'no_key' }));
        continue;
      }

      setDecryptionStatus(prev => ({ ...prev, [report.id]: 'loading' }));

      try {
        const wrappedKeyBuffer = fromBase64(grant.wrappedKey);
        const privateKey = storedKey.privateKey;

        // Unwrap the AES key
        const aesKey = await window.crypto.subtle.unwrapKey(
          'raw',
          wrappedKeyBuffer,
          privateKey,
          { name: 'RSA-OAEP' },
          { name: 'AES-GCM', length: 256 },
          true,
          ['decrypt']
        );

        // Decrypt the payload
        const ivBuffer = fromBase64(report.encryptionIv!);
        const payloadBuffer = fromBase64(report.encryptedPayload);

        const decryptedBuffer = await window.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
          aesKey,
          payloadBuffer
        );

        const decoder = new TextDecoder();
        const decryptedText = decoder.decode(decryptedBuffer);
        const pii = JSON.parse(decryptedText);

        setDecryptedData(prev => ({
          ...prev,
          [report.id]: {
            requesterName: pii.requesterName || 'Encrypted Name',
            requesterSignature: pii.requesterSignature || 'Encrypted Signature',
            contentDescription: pii.contentDescription || 'Encrypted Description',
          }
        }));
        setDecryptionStatus(prev => ({ ...prev, [report.id]: 'success' }));
      } catch (err) {
        console.error(`Failed to decrypt report ${report.id}:`, err);
        setDecryptionStatus(prev => ({ ...prev, [report.id]: 'failed' }));
      }
    }
  };

  useEffect(() => {
    if (user?.id && reports.length > 0) {
      decryptAllReports(reports, user.id);
    }
  }, [user?.id, reports]);

  // Poll intervals or refresh handler
  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await getActiveNciiReportsAction();
      // Parse dates from string/JSON serialization safely if they aren't native Date objects
      const parsedReports = (res as any[]).map((r) => ({
        ...r,
        createdAt: new Date(r.createdAt),
        slaDeadline: new Date(r.slaDeadline),
        reviewedAt: r.reviewedAt ? new Date(r.reviewedAt) : null,
        contentUrls: typeof r.contentUrls === 'string' ? JSON.parse(r.contentUrls) : (r.contentUrls || []),
      })) as NciiReport[];
      setReports(parsedReports);
    } catch (err: any) {
      console.error('Failed to fetch reports:', err);
      toast({
        variant: 'destructive',
        title: 'Fetch Failed',
        description: err.message || 'Could not load active NCII reports.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleResolve = async () => {
    if (!selectedReport || !resolutionAction) return;
    setIsResolving(true);
    try {
      await resolveNciiReportAction(selectedReport.id, resolutionAction, actionNotes || undefined);
      toast({
        title: 'Report Resolved',
        description: `Successfully resolved report ${selectedReport.trackingNumber}.`,
      });
      // Reset state and reload
      setSelectedReport(null);
      setActionNotes('');
      setResolutionAction(null);
      await fetchReports();
    } catch (err: any) {
      console.error('Failed to resolve report:', err);
      toast({
        variant: 'destructive',
        title: 'Resolution Failed',
        description: err.message || 'Failed to apply resolution.',
      });
    } finally {
      setIsResolving(false);
    }
  };

  // Helper to compute countdown text and color classes
  const getSlaDetails = (deadline: Date, status: NciiReport['status']) => {
    if (['removed', 'rejected', 'requires_info'].includes(status)) {
      return {
        text: 'Resolved',
        colorClass: 'bg-muted text-muted-foreground border-border',
        barClass: 'bg-muted',
      };
    }

    const diffMs = deadline.getTime() - Date.now();
    const diffHrs = diffMs / (1000 * 60 * 60);

    if (diffMs <= 0) {
      return {
        text: 'SLA Overdue',
        colorClass: 'bg-red-500/20 text-red-500 border-red-500/30 animate-pulse font-bold',
        barClass: 'bg-red-600',
      };
    }

    if (diffHrs < 12) {
      return {
        text: `${Math.ceil(diffHrs)} hours left (Critical)`,
        colorClass: 'bg-red-500/10 text-red-500 border-red-500/20 font-semibold',
        barClass: 'bg-red-500',
      };
    }

    if (diffHrs < 24) {
      return {
        text: `${Math.ceil(diffHrs)} hours left (Warning)`,
        colorClass: 'bg-amber-500/10 text-amber-500 border-amber-500/20 font-semibold',
        barClass: 'bg-amber-500',
      };
    }

    const days = Math.floor(diffHrs / 24);
    const hrs = Math.ceil(diffHrs % 24);
    return {
      text: `${days}d ${hrs}h left`,
      colorClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      barClass: 'bg-emerald-500',
    };
  };

  const filteredReports = reports.filter((r) => {
    if (filter === 'pending') {
      return ['pending', 'in_review'].includes(r.status);
    }
    if (filter === 'resolved') {
      return ['removed', 'rejected', 'requires_info'].includes(r.status);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-mono tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-red-500" /> NCII Urgent Takedown Queue
          </h2>
          <p className="text-sm text-muted-foreground">
            Take It Down Act platform mandates: 48-hour SLA deadline tracking. Submissions are processed with expedited pipeline.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center space-x-1 bg-muted p-1 rounded-lg">
            <Button
              variant={filter === 'pending' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setFilter('pending')}
              className="text-xs"
            >
              Pending ({reports.filter((r) => ['pending', 'in_review'].includes(r.status)).length})
            </Button>
            <Button
              variant={filter === 'resolved' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setFilter('resolved')}
              className="text-xs"
            >
              Resolved ({reports.filter((r) => ['removed', 'rejected', 'requires_info'].includes(r.status)).length})
            </Button>
            <Button
              variant={filter === 'all' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setFilter('all')}
              className="text-xs"
            >
              All ({reports.length})
            </Button>
          </div>

          <Button variant="outline" size="icon" onClick={fetchReports} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <RefreshCw className="h-10 w-10 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Fetching reports queue...</p>
        </div>
      ) : filteredReports.length === 0 ? (
        <Card className="border-dashed bg-card/25 py-20 flex flex-col items-center justify-center text-center p-6">
          <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
            <Check className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle className="text-lg">Takedown queue is clear</CardTitle>
          <CardDescription className="max-w-xs mt-1">
            No active reports match the current filter. Tribes is in compliance with the Take It Down Act.
          </CardDescription>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {filteredReports.map((report) => {
            const sla = getSlaDetails(report.slaDeadline, report.status);
            return (
              <Card
                key={report.id}
                className="overflow-hidden border bg-card/65 backdrop-blur-sm relative transition-all hover:shadow-lg shadow-sm"
              >
                <div className={`absolute top-0 left-0 w-1.5 h-full ${sla.barClass}`} />
                <CardHeader className="pb-4 border-b pl-8">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-semibold tracking-wide text-foreground">
                          {report.trackingNumber}
                        </span>
                        <Badge variant="outline" className="text-[10px] font-mono px-2 py-0.5">
                          {report.contentType === 'minor' ? 'Minor (Under 18)' : report.contentType === 'deepfake' ? 'AI/Deepfake' : 'NCII'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Submitted: {report.createdAt.toLocaleString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      {report.hasPreHashes && (
                        <Badge className="bg-emerald-600/20 text-emerald-500 border-emerald-500/30 text-xs font-semibold px-2 py-0.5 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" /> Hashes Pre-Locked
                        </Badge>
                      )}
                      {report.abuseScore !== undefined && report.abuseScore >= 3 && (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-xs font-semibold px-2 py-0.5 flex items-center gap-1 animate-pulse">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> {report.abuseScore} Dismissed Claims (30d)
                        </Badge>
                      )}
                      <Badge className={`px-2.5 py-1 text-xs border font-medium ${sla.colorClass}`} variant="secondary">
                        {sla.text}
                      </Badge>
                      <Badge variant="secondary" className="capitalize text-xs">
                        {report.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-5 pt-5 pl-8 pr-6 text-sm">
                  {/* Reporter details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/30 border p-3 rounded-lg">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground block">Reporter</span>
                      <strong className="text-foreground text-sm font-semibold">
                        {!report.encryptedPayload ? (
                          report.requesterName
                        ) : decryptionStatus[report.id] === 'success' ? (
                          <span className="flex items-center gap-1">🔒 {decryptedData[report.id]?.requesterName}</span>
                        ) : decryptionStatus[report.id] === 'loading' ? (
                          <span className="inline-block h-4 w-32 bg-muted/60 animate-pulse rounded" />
                        ) : decryptionStatus[report.id] === 'no_key' ? (
                          <span className="text-amber-500 font-medium text-xs flex items-center gap-1">🔒 Private Key Missing (Unable to Decrypt)</span>
                        ) : (
                          <span className="text-red-500 font-medium text-xs flex items-center gap-1">🔒 Decryption Failed</span>
                        )}
                      </strong>
                      <span className="block text-xs text-muted-foreground">{report.requesterEmail}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground block">Depiction</span>
                      <span className="text-xs text-foreground font-medium">
                        {report.isDepictedPerson ? 'Depicted Individual (Self)' : 'Authorized Representative'}
                      </span>
                      <span className="block text-[10px] text-muted-foreground italic">
                        {!report.encryptedPayload ? (
                          `Signed: ${report.requesterSignature}`
                        ) : decryptionStatus[report.id] === 'success' ? (
                          `Signed: 🔒 ${decryptedData[report.id]?.requesterSignature}`
                        ) : decryptionStatus[report.id] === 'loading' ? (
                          <span className="flex items-center gap-1">
                            Signed: <span className="inline-block h-3.5 w-24 bg-muted/60 animate-pulse rounded" />
                          </span>
                        ) : decryptionStatus[report.id] === 'no_key' ? (
                          'Signed: 🔒 (Key Missing)'
                        ) : (
                          'Signed: 🔒 (Decryption Failed)'
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Context and Description */}
                  {!report.encryptedPayload ? (
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground block">Description of intimate content</span>
                      <p className="text-foreground leading-relaxed p-3.5 bg-card border rounded-lg whitespace-pre-wrap">
                        {report.contentDescription}
                      </p>
                    </div>
                  ) : decryptionStatus[report.id] === 'success' ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground block">Description of intimate content</span>
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px] font-semibold py-0 px-2 flex items-center gap-1 font-mono">
                          🔒 Decrypted Client-Side
                        </Badge>
                      </div>
                      <p className="text-foreground leading-relaxed p-3.5 bg-card border rounded-lg whitespace-pre-wrap">
                        {decryptedData[report.id]?.contentDescription}
                      </p>
                    </div>
                  ) : decryptionStatus[report.id] === 'loading' ? (
                    <div className="space-y-2">
                      <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground block">Description of intimate content</span>
                      <div className="space-y-2 p-3.5 bg-card border border-dashed rounded-lg animate-pulse">
                        <div className="h-4 bg-muted/60 rounded w-3/4" />
                        <div className="h-4 bg-muted/60 rounded w-5/6" />
                        <div className="h-4 bg-muted/60 rounded w-2/3" />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground block">Description of intimate content</span>
                      <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/20 backdrop-blur-xs flex gap-3 text-red-500">
                        <AlertCircle className="h-5 w-5 shrink-0" />
                        <div className="space-y-1">
                          <h4 className="font-semibold text-xs text-red-400">Decryption Failed or Key Missing</h4>
                          <p className="text-xs text-muted-foreground">
                            This report is protected with client-side envelope encryption. To view the details, please ensure your Trust &amp; Safety private key is loaded in IndexedDB.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Details of Infringement */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {report.posterUsername && (
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground block">Reported Poster</span>
                        <div className="flex items-center gap-2">
                          <span className="text-foreground font-mono text-xs bg-muted/40 px-2 py-0.5 rounded">
                            {report.posterUsername}
                          </span>
                          {report.posterUser ? (
                            <a
                              href={`/u/${report.posterUser.slug || report.posterUser.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary font-semibold hover:underline flex items-center gap-1 bg-primary/5 px-2 py-0.5 rounded border border-primary/10"
                            >
                              View Profile ({report.posterUser.name}) <Eye className="h-3 w-3" />
                            </a>
                          ) : (
                            <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20 text-[10px] py-0 px-1.5 h-5 flex items-center">
                              No Exact Match
                            </Badge>
                          )}
                        </div>
                        {!report.posterUser && (
                          <FuzzyMatcher username={report.posterUsername} />
                        )}
                      </div>
                    )}
                    {report.searchTerms && (
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground block">Search terms / Hashtags</span>
                        <span className="text-foreground text-xs font-mono">{report.searchTerms}</span>
                      </div>
                    )}
                  </div>

                  {/* Infringing URLs */}
                  {report.contentUrls && report.contentUrls.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground block">Reported Post Links</span>
                      <div className="space-y-1 font-mono text-xs">
                        {report.contentUrls.map((url, index) => (
                          <a
                            key={index}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline flex items-center gap-1 w-fit bg-muted/40 px-2 py-1 rounded"
                          >
                            {url} <Eye className="h-3 w-3" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Resolution outcomes notes */}
                  {report.actionTaken && (
                    <div className="bg-muted p-4 border rounded-lg space-y-1">
                      <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground block">Administrative Resolution</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="capitalize text-xs font-semibold">
                          {report.actionTaken.replace(/_/g, ' ')}
                        </Badge>
                        {report.reviewedAt && (
                          <span className="text-xs text-muted-foreground">
                            on {report.reviewedAt.toLocaleString()}
                          </span>
                        )}
                      </div>
                      {report.actionNotes && (
                        <p className="text-xs text-muted-foreground mt-2 italic">"{report.actionNotes}"</p>
                      )}
                    </div>
                  )}
                </CardContent>

                {['pending', 'in_review'].includes(report.status) && (
                  <CardFooter className="border-t bg-card/25 pl-8 pr-6 py-4 flex flex-wrap gap-2.5 justify-end">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            setSelectedReport(report);
                            setResolutionAction('content_removed');
                            setActionNotes('');
                          }}
                          className="font-semibold text-xs flex items-center gap-1.5"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove Content &amp; Hash Block
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2 text-red-600">
                            <AlertTriangle className="h-5 w-5" /> Takedown content &amp; register hashes?
                          </DialogTitle>
                          <DialogDescription>
                            This will search for and completely remove matching content across the entire platform. Removed images will be converted to PDQ perceptual hashes and added to the secure blocklist to prevent any re-uploads.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2 py-4">
                          <label className="text-xs font-bold text-foreground">Action Notes (Sent to reporter)</label>
                          <Textarea
                            placeholder="Enter notes explaining the content removal. This will be automatically sent to the reporter."
                            value={actionNotes}
                            onChange={(e) => setActionNotes(e.target.value)}
                            className="min-h-[80px]"
                          />
                        </div>
                        <DialogFooter>
                          <Button variant="ghost" onClick={() => setSelectedReport(null)}>Cancel</Button>
                          <Button variant="destructive" onClick={handleResolve} disabled={isResolving}>
                            {isResolving ? 'Executing removal...' : 'Remove Post & Block Hash'}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedReport(report);
                            setResolutionAction('insufficient_info');
                            setActionNotes('');
                          }}
                          className="font-semibold text-xs flex items-center gap-1.5"
                        >
                          <HelpCircle className="h-3.5 w-3.5" /> Request Info
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Request more details?</DialogTitle>
                          <DialogDescription>
                            Change status to Requires Info. The reporter will be emailed requesting additional URLs, usernames, or content details to execute the verification.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2 py-4">
                          <label className="text-xs font-bold text-foreground font-mono">Message to reporter</label>
                          <Textarea
                            placeholder="Please specify exactly what information is missing (e.g. valid URLs, post titles, exact timestamps)."
                            value={actionNotes}
                            onChange={(e) => setActionNotes(e.target.value)}
                            className="min-h-[80px]"
                          />
                        </div>
                        <DialogFooter>
                          <Button variant="ghost" onClick={() => setSelectedReport(null)}>Cancel</Button>
                          <Button onClick={handleResolve} disabled={isResolving}>
                            {isResolving ? 'Updating...' : 'Request Information'}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedReport(report);
                            setResolutionAction('not_ncii');
                            setActionNotes('');
                          }}
                          className="font-semibold text-xs flex items-center gap-1.5"
                        >
                          <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" /> Dismiss (Not NCII)
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Dismiss Report as Outside Scope?</DialogTitle>
                          <DialogDescription>
                            This report will be rejected. The reporter will receive an email stating the imagery was outside the legal scope of the NCII/Take It Down policies.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2 py-4">
                          <label className="text-xs font-bold text-foreground">Action Notes (Explanation)</label>
                          <Textarea
                            placeholder="Enter the reason why this content is outside the scope of our NCII policy."
                            value={actionNotes}
                            onChange={(e) => setActionNotes(e.target.value)}
                            className="min-h-[80px]"
                          />
                        </div>
                        <DialogFooter>
                          <Button variant="ghost" onClick={() => setSelectedReport(null)}>Cancel</Button>
                          <Button onClick={handleResolve} disabled={isResolving}>
                            {isResolving ? 'Rejecting report...' : 'Dismiss Report'}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedReport(report);
                            setResolutionAction('content_not_found');
                            setActionNotes('');
                          }}
                          className="font-semibold text-xs flex items-center gap-1.5"
                        >
                          <Eye className="h-3.5 w-3.5" /> Content Not Found
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Content Not Found?</DialogTitle>
                          <DialogDescription>
                            Dismiss the report because the content could not be located on the platform (e.g. already deleted or wrong links).
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2 py-4">
                          <label className="text-xs font-bold text-foreground">Resolution Notes</label>
                          <Textarea
                            placeholder="Provide details about why the content could not be located."
                            value={actionNotes}
                            onChange={(e) => setActionNotes(e.target.value)}
                            className="min-h-[80px]"
                          />
                        </div>
                        <DialogFooter>
                          <Button variant="ghost" onClick={() => setSelectedReport(null)}>Cancel</Button>
                          <Button onClick={handleResolve} disabled={isResolving}>
                            {isResolving ? 'Resolving...' : 'Confirm Not Found'}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </CardFooter>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
