"use client";

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
} from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";
import { getProposals, createProposal } from "@/lib/actions/voting-actions";
import type { Proposal } from "@/lib/services/voting-service";

const STATUS_STYLES: Record<string, { variant: 'default' | 'secondary' | 'destructive'; icon: typeof CheckCircle2 }> = {
  active: { variant: 'default', icon: Clock },
  closed: { variant: 'secondary', icon: CheckCircle2 },
  canceled: { variant: 'destructive', icon: XCircle },
};

import { AuthGuard } from '@/components/providers/auth-guard';

export default function VotingPage() {
  return (
    <AuthGuard message="Sign in to participate in platform governance and vote on community proposals.">
      <VotingContent />
    </AuthGuard>
  );
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
      {/* Header */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-3">
          <Vote className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Co-Op Governance</h1>
            <p className="text-sm text-muted-foreground">Vote on proposals that shape the platform.</p>
          </div>
        </div>
        {isAdmin && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> New Proposal</Button>
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

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(['all', 'active', 'closed'] as const).map(f => (
          <Button
            key={f}
            variant={filter === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f)}
            className="capitalize"
          >
            {f}
          </Button>
        ))}
      </div>

      {/* Proposals List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : proposals.length === 0 ? (
        <Card className="shadow-lg">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Vote className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No proposals yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              {isAdmin ? 'Create the first proposal to start co-op governance.' : 'Check back soon for community proposals.'}
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

            return (
              <Card key={p.id} className="shadow-md hover:shadow-lg transition-shadow cursor-pointer group"
                    onClick={() => router.push(`/voting/${p.id}`)}>
                <CardContent className="p-4 flex items-start gap-4">
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
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-base truncate group-hover:text-primary transition-colors">{p.title}</h3>
                      <Badge variant={style.variant} className="text-xs capitalize shrink-0">{p.status}</Badge>
                      {hasVoted && <Badge variant="outline" className="text-xs shrink-0">✓ Voted</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{p.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {p.voteCount} votes</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {isExpired ? 'Ended' : `Ends ${p.deadline.toLocaleDateString()}`}
                      </span>
                      <span>by {p.creatorName}</span>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0 mt-2 group-hover:text-primary transition-colors" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Upgrade CTA for non-voters */}
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
