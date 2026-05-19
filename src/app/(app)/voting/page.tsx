"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { proposalPath } from '@/lib/utils/paths';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Vote, Plus, Clock, Users, CheckCircle2, XCircle,
  ArrowRight, Sparkles, Lock, Loader2, Trash2,
  Shield, Crown, Scale, AlertTriangle, Landmark, Globe,
  ThumbsUp, ThumbsDown, Gavel, RotateCcw,
} from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";
import { getProposals, createProposal, checkCanCreateProposal } from "@/lib/actions/voting-actions";
import type { Proposal } from "@/lib/services/voting-service";

import { AuthGuard } from '@/components/providers/auth-guard';

/** Strip markdown syntax for plain-text previews */
function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')       // headers
    .replace(/\*\*(.+?)\*\*/g, '$1')    // bold
    .replace(/\*(.+?)\*/g, '$1')        // italic
    .replace(/!\[.*?\]\(.*?\)/g, '')     // images
    .replace(/\[(.+?)\]\(.*?\)/g, '$1') // links
    .replace(/^>\s+/gm, '')            // blockquotes
    .replace(/^---+$/gm, '')           // horizontal rules
    .replace(/^[*\-+]\s+/gm, '')       // list markers
    .replace(/`(.+?)`/g, '$1')          // inline code
    .replace(/\n{2,}/g, ' ')           // collapse multiple newlines
    .replace(/\n/g, ' ')               // remaining newlines
    .trim();
}

const STATUS_STYLES: Record<string, { variant: 'default' | 'secondary' | 'destructive'; icon: typeof CheckCircle2 }> = {
  active: { variant: 'default', icon: Clock },
  closed: { variant: 'secondary', icon: CheckCircle2 },
  canceled: { variant: 'destructive', icon: XCircle },
};

export default function VotingPage() {
  return (
    <AuthGuard message="Sign in to participate in platform governance and vote on community proposals.">
      <VotingContent />
    </AuthGuard>
  );
}

/** Renders the admin shield or founder crown flair badge */
function CreatorFlair({ role, isFounder }: { role: string; isFounder: boolean }) {
  if (role === 'Admin') {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 border-amber-400/50 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-semibold">
        <Shield className="h-3 w-3" /> Admin
      </Badge>
    );
  }
  if (isFounder) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 border-violet-400/50 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 font-semibold">
        <Crown className="h-3 w-3" /> Tribe Founder
      </Badge>
    );
  }
  return null;
}

function VotingContent() {
  const router = useRouter();
  const { role, user } = useUser();
  const { toast } = useToast();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'closed'>('all');

  // Form state for new proposal
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadlineDays, setDeadlineDays] = useState('7');
  const [optionInputs, setOptionInputs] = useState(['', '']);

  const isAdmin = role === 'Admin';
  const [canPropose, setCanPropose] = useState(false);

  // Check if user can create proposals (admin or tribe founder)
  useEffect(() => {
    if (user) {
      checkCanCreateProposal().then(setCanPropose).catch(() => {});
    }
  }, [user]);

  const loadProposals = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getProposals(filter === 'all' ? undefined : { status: filter });
      setProposals(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { loadProposals(); }, [loadProposals]);

  const handleCreate = async () => {
    const opts = optionInputs.filter(o => o.trim().length > 0);
    if (!title.trim() || !description.trim() || opts.length < 2) {
      toast({ variant: 'destructive', title: 'Validation Error', description: 'Title, description, and at least 2 options are required.' });
      return;
    }
    setCreating(true);
    try {
      await createProposal({
        title: title.trim(),
        description: description.trim(),
        deadlineDays: parseInt(deadlineDays),
        options: opts,
      });
      toast({ title: 'Proposal Created', description: 'Your proposal is now open for voting.' });
      setCreateOpen(false);
      setTitle(''); setDescription(''); setOptionInputs(['', '']);
      loadProposals();
    } catch (e: unknown) {
      toast({ variant: 'destructive', title: 'Error', description: (e instanceof Error ? e.message : 'Failed to create proposal') });
    }
    setCreating(false);
  };

  const addOption = () => {
    if (optionInputs.length < 10) setOptionInputs([...optionInputs, '']);
  };

  const removeOption = (idx: number) => {
    if (optionInputs.length > 2) setOptionInputs(optionInputs.filter((_, i) => i !== idx));
  };

  const updateOption = (idx: number, value: string) => {
    const next = [...optionInputs];
    next[idx] = value;
    setOptionInputs(next);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">

      {/* ── Header ── */}
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-6 sm:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.15),transparent_60%)]" />
        <div className="absolute top-0 right-0 w-40 h-40 opacity-5">
          <Gavel className="w-full h-full text-white" />
        </div>
        <div className="relative flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                <Scale className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Co-Op Governance</h1>
                <p className="text-sm text-slate-400">Official platform decisions &mdash; one person, one vote.</p>
              </div>
            </div>
          </div>
          {canPropose && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="shrink-0 w-full sm:w-auto">
                  <Plus className="mr-2 h-4 w-4" /> New Proposal
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create Proposal</DialogTitle>
                  <DialogDescription>Create a new platform-wide proposal for co-op members to vote on.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="What should we decide?" />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Provide context for the vote..." className="min-h-[80px]" />
                  </div>
                  <div className="space-y-2">
                    <Label>Voting Deadline</Label>
                    <Select value={deadlineDays} onValueChange={setDeadlineDays}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3 Days</SelectItem>
                        <SelectItem value="7">7 Days</SelectItem>
                        <SelectItem value="14">14 Days</SelectItem>
                        <SelectItem value="30">30 Days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Options (min 2, max 10)</Label>
                    {optionInputs.map((opt, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          value={opt}
                          onChange={e => updateOption(i, e.target.value)}
                          placeholder={`Option ${i + 1}`}
                          className="flex-1"
                        />
                        {optionInputs.length > 2 && (
                          <Button variant="ghost" size="icon" onClick={() => removeOption(i)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    ))}
                    {optionInputs.length < 10 && (
                      <Button variant="outline" size="sm" onClick={addOption}>
                        <Plus className="mr-1 h-3 w-3" /> Add Option
                      </Button>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreate} disabled={creating}>
                    {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Vote className="mr-2 h-4 w-4" />}
                    Create Proposal
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/80 dark:bg-amber-950/30 px-4 py-3 space-y-2">
        <div className="flex items-center gap-3">
          <Landmark className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-xs text-amber-800/80 dark:text-amber-300/70">
            Tribes cannot entertain any proposals that violate United States Federal Law or Washington State Law.
            Tribes reserves the right to refuse any proposal, but is committed to giving a reason.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Crown className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-xs text-amber-800/80 dark:text-amber-300/70">
            Only <strong>Tribe Founders</strong> and <strong>Platform Admins</strong> can submit proposals.
            Found a tribe to earn your voice in governance.
          </p>
        </div>
      </div>

      {/* ── Filter Tabs ── */}
      <div className="flex items-center gap-2">
        {(['all', 'active', 'closed'] as const).map(f => (
          <Button
            key={f}
            variant={filter === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f)}
            className="capitalize"
          >
            {f === 'all' ? 'All Proposals' : f}
          </Button>
        ))}
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">{proposals.length} proposal{proposals.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ── Proposals List ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : proposals.length === 0 ? (
        <Card className="shadow-lg">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Scale className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-lg font-medium text-muted-foreground">No proposals yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              {canPropose ? 'Create the first proposal to start co-op governance.' : 'Proposals can be submitted by tribe founders and admins.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {proposals.map(p => {
            const style = STATUS_STYLES[p.status] ?? STATUS_STYLES.active!;
            const StatusIcon = style.icon;
            const isExpired = p.deadline < new Date();
            const hasVoted = !!p.userVoteOptionId;

            // Calculate "support" vs "oppose" for the quick-glance bar
            const supportOpt = p.options.find(o => o.label.toLowerCase().includes('support') || o.label.toLowerCase().includes('yes') || o.label.toLowerCase().includes('adopt') || o.label.toLowerCase().includes('approve'));
            const opposeOpt = p.options.find(o => o.label.toLowerCase().includes('oppose') || o.label.toLowerCase().includes('no') || o.label.toLowerCase().includes('reject') || o.label.toLowerCase().includes('ban'));
            const reviseOpt = p.options.find(o => o.label.toLowerCase().includes('revise') || o.label.toLowerCase().includes('revision') || o.label.toLowerCase().includes('send back') || o.label.toLowerCase().includes('discussion'));

            const hasThreeOptions = p.options.length === 3 && !!supportOpt && !!opposeOpt && !!reviseOpt;

            const supportCount = supportOpt?.voteCount ?? 0;
            const opposeCount = opposeOpt?.voteCount ?? 0;
            const reviseCount = reviseOpt?.voteCount ?? 0;

            const supportPct = p.voteCount > 0 ? Math.round((supportCount / p.voteCount) * 100) : 50;
            const revisePct = p.voteCount > 0 ? Math.round((reviseCount / p.voteCount) * 100) : 0;
            const opposePct = p.voteCount > 0 ? Math.round((opposeCount / p.voteCount) * 100) : 50;

            return (
              <Card key={p.id} className="shadow-md hover:shadow-lg transition-all cursor-pointer group border-l-4 border-l-transparent hover:border-l-primary"
                    onClick={() => router.push(proposalPath(p.id, p.slug))}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start gap-4">
                    {/* Status Icon */}
                    <div className="shrink-0 mt-1">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                        p.status === 'active' ? 'bg-green-100 dark:bg-green-900/30' :
                        p.status === 'closed' ? 'bg-gray-100 dark:bg-gray-800' :
                        'bg-red-100 dark:bg-red-900/30'
                      }`}>
                        <StatusIcon className={`h-5 w-5 ${
                          p.status === 'active' ? 'text-green-600' :
                          p.status === 'closed' ? 'text-gray-500' :
                          'text-red-500'
                        }`} />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold text-base truncate group-hover:text-primary transition-colors">{p.title}</h3>
                        <Badge variant={style.variant} className="text-xs capitalize shrink-0">{p.status}</Badge>
                        {hasVoted && <Badge variant="outline" className="text-xs shrink-0 text-green-600 border-green-300 dark:border-green-700">✓ Voted</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{stripMarkdown(p.description)}</p>

                      {/* Creator info with flair */}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          by <span className="font-medium text-foreground/80">{p.creatorName}</span>
                        </span>
                        <CreatorFlair role={p.creatorRole} isFounder={p.creatorIsFounder} />
                      </div>

                      {/* Quick-glance vote bar (for proposals with votes) */}
                      {p.voteCount > 0 && supportOpt && opposeOpt && (
                        hasThreeOptions ? (
                          <div className="mt-3 space-y-1">
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                              <span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3 text-green-500" /> {supportCount}</span>
                              <span className="flex items-center gap-1.5"><RotateCcw className="h-3 w-3 text-amber-500" /> {reviseCount}</span>
                              <span className="flex items-center gap-1">{opposeCount} <ThumbsDown className="h-3 w-3 text-red-400" /></span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800/50 rounded-full overflow-hidden flex">
                              <div
                                className="h-full bg-green-500 transition-all duration-500"
                                style={{ width: `${supportPct}%` }}
                              />
                              <div
                                className="h-full bg-amber-500 transition-all duration-500"
                                style={{ width: `${revisePct}%` }}
                              />
                              <div
                                className="h-full bg-red-500 transition-all duration-500"
                                style={{ width: `${opposePct}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 space-y-1">
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                              <span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3 text-green-500" /> {supportCount}</span>
                              <span className="flex items-center gap-1">{opposeCount} <ThumbsDown className="h-3 w-3 text-red-400" /></span>
                            </div>
                            <div className="h-1.5 w-full bg-red-100 dark:bg-red-900/30 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded-full transition-all duration-500"
                                style={{ width: `${supportPct}%` }}
                              />
                            </div>
                          </div>
                        )
                      )}

                      {/* Meta */}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {p.voteCount} vote{p.voteCount !== 1 ? 's' : ''}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {isExpired ? 'Ended' : `Ends ${p.deadline.toLocaleDateString()}`}
                        </span>
                      </div>
                    </div>

                    <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0 mt-2 group-hover:text-primary transition-colors" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Upgrade CTA for non-voters ── */}
      {!loading && role === 'Human_Free' && (
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-4 p-4">
            <Lock className="h-8 w-8 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-sm">Want to vote on proposals?</p>
              <p className="text-xs text-muted-foreground">Upgrade to a Co-Op membership to participate in platform governance.</p>
            </div>
            <Button size="sm" onClick={() => router.push('/billing')}>
              <Sparkles className="mr-1 h-3 w-3" /> Upgrade
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
