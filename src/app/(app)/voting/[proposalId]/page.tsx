"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Vote, Clock, Users, CheckCircle2, XCircle,
  Loader2, Lock, Sparkles, AlertTriangle,
  Shield, Crown, ThumbsUp, ThumbsDown, Scale, Landmark,
  Gavel, Globe, RotateCcw,
} from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";
import { getProposalById, castVote, closeProposal, cancelProposal } from "@/lib/actions/voting-actions";
import { getMySubscription } from "@/lib/actions/profile-actions";
import type { Proposal } from "@/lib/services/voting-service";

import { AuthGuard } from '@/components/providers/auth-guard';
import { ProposalDiscussion } from './proposal-discussion';
import { MarkdownContent } from '@/components/ui/markdown-content';

export default function ProposalDetailPage({ proposalId: propProposalId }: { proposalId?: string }) {
  return (
    <AuthGuard message="Sign in to view proposal details and cast your vote.">
      <ProposalDetailContent proposalId={propProposalId} />
    </AuthGuard>
  );
}

/** Renders the admin shield or founder crown flair badge */
function CreatorFlair({ role, isFounder, size = 'sm' }: { role: string; isFounder: boolean; size?: 'sm' | 'lg' }) {
  const isLg = size === 'lg';
  if (role === 'Admin') {
    return (
      <Badge variant="outline" className={`gap-1 border-amber-400/50 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-semibold ${isLg ? 'text-xs px-2.5 py-0.5' : 'text-[10px]'}`}>
        <Shield className={isLg ? 'h-3.5 w-3.5' : 'h-3 w-3'} /> Platform Admin
      </Badge>
    );
  }
  if (isFounder) {
    return (
      <Badge variant="outline" className={`gap-1 border-violet-400/50 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 font-semibold ${isLg ? 'text-xs px-2.5 py-0.5' : 'text-[10px]'}`}>
        <Crown className={isLg ? 'h-3.5 w-3.5' : 'h-3 w-3'} /> Tribe Founder
      </Badge>
    );
  }
  return null;
}

function ProposalDetailContent({ proposalId: propProposalId }: { proposalId?: string }) {
  const router = useRouter();
  const params = useParams();
  const proposalId = propProposalId || (params.proposalId as string);
  const { role, user } = useUser();
  const { toast } = useToast();

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState<string | null>(null); // option ID being voted on
  const [actionLoading, setActionLoading] = useState(false);
  const [subSource, setSubSource] = useState<string | null>(null);

  const isAdmin = role === 'Admin';
  const isFree = role === 'Human_Free';
  const isEarned = subSource === 'earned';
  const canVote = !isFree && !isEarned; // Only paid/founding can vote
  const isCreator = proposal?.createdBy === user?.id;

  const loadProposal = useCallback(async () => {
    try {
      const data = await getProposalById(proposalId);
      setProposal(data);
    } catch {
      console.error('Failed to load proposal');
    }
    setLoading(false);
  }, [proposalId]);

  useEffect(() => { loadProposal(); }, [loadProposal]);

  // Load subscription source to detect earned memberships
  useEffect(() => {
    if (user) {
      getMySubscription().then(sub => setSubSource(sub?.subscription?.source ?? null)).catch(() => {});
    }
  }, [user]);

  const handleVote = async (optionId: string) => {
    setVoting(optionId);
    try {
      await castVote(proposalId, optionId);
      toast({ title: 'Vote Cast!', description: 'Your vote has been recorded.' });
      loadProposal();
    } catch (e: unknown) {
      toast({ variant: 'destructive', title: 'Cannot Vote', description: (e instanceof Error ? e.message : 'Failed to cast vote.') });
    }
    setVoting(null);
  };

  const handleClose = async () => {
    setActionLoading(true);
    try {
      await closeProposal(proposalId);
      toast({ title: 'Proposal Closed', description: 'Voting is now closed.' });
      loadProposal();
    } catch (e: unknown) {
      toast({ variant: 'destructive', title: 'Error', description: (e instanceof Error ? e.message : 'Failed') });
    }
    setActionLoading(false);
  };

  const handleCancel = async () => {
    setActionLoading(true);
    try {
      await cancelProposal(proposalId);
      toast({ title: 'Proposal Canceled', description: 'This proposal has been canceled.' });
      loadProposal();
    } catch (e: unknown) {
      toast({ variant: 'destructive', title: 'Error', description: (e instanceof Error ? e.message : 'Failed') });
    }
    setActionLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="max-w-xl mx-auto mt-12">
        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
            <CardTitle>Proposal Not Found</CardTitle>
          </CardHeader>
          <CardFooter className="flex justify-center">
            <Button variant="outline" onClick={() => router.push('/voting')}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Proposals
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const isActive = proposal.status === 'active';
  const hasVoted = !!proposal.userVoteOptionId;
  const isExpired = proposal.deadline < new Date();
  const showResults = hasVoted || !isActive || isExpired;
  const winningOption = [...proposal.options].sort((a, b) => b.voteCount - a.voteCount)[0];

  // Detect binary up/down or ternary up/down/revise vote structure
  const isBinaryVote = proposal.options.length === 2;
  const isTernaryVote = proposal.options.length === 3;
  const supportOpt = proposal.options.find(o =>
    o.label.toLowerCase().includes('support') || o.label.toLowerCase().includes('yes') ||
    o.label.toLowerCase().includes('adopt') || o.label.toLowerCase().includes('approve') ||
    o.label.toLowerCase().includes('allow')
  );
  const opposeOpt = proposal.options.find(o =>
    o.label.toLowerCase().includes('oppose') || o.label.toLowerCase().includes('no') ||
    o.label.toLowerCase().includes('reject') || o.label.toLowerCase().includes('ban') ||
    o.label.toLowerCase().includes('restrict')
  );
  const reviseOpt = proposal.options.find(o =>
    o.label.toLowerCase().includes('revise') || o.label.toLowerCase().includes('revision') ||
    o.label.toLowerCase().includes('send back') || o.label.toLowerCase().includes('discussion')
  );
  const showBinaryUI = isBinaryVote && supportOpt && opposeOpt;
  const showTernaryUI = isTernaryVote && supportOpt && opposeOpt && reviseOpt;

  return (
    <div className="space-y-3 md:space-y-6 min-w-0">
      <div className="flex items-center mt-2">
        <Button variant="outline" size="sm" onClick={() => router.push('/voting')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> All Proposals
        </Button>
      </div>

      {/* ── Proposal Header ── */}
      <Card className="shadow-xl overflow-hidden">
        {/* Status ribbon */}
        <div className={`h-1.5 w-full ${
          proposal.status === 'active' ? 'bg-gradient-to-r from-green-400 to-emerald-500' :
          proposal.status === 'closed' ? 'bg-gradient-to-r from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-700' :
          'bg-gradient-to-r from-red-400 to-rose-500'
        }`} />
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-xl font-bold">{proposal.title}</CardTitle>
                <Badge
                  variant={proposal.status === 'active' ? 'default' : proposal.status === 'closed' ? 'secondary' : 'destructive'}
                  className="capitalize shrink-0"
                >
                  {proposal.status}
                </Badge>
              </div>

              {/* Creator info with flair */}
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  {proposal.creatorAvatar && <AvatarImage src={proposal.creatorAvatar} alt={proposal.creatorName} />}
                  <AvatarFallback className="text-xs font-semibold">
                    {proposal.creatorName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">
                    Proposed by <span className="font-semibold text-foreground">{proposal.creatorName}</span>
                  </span>
                  <CreatorFlair role={proposal.creatorRole} isFounder={proposal.creatorIsFounder} size="lg" />
                </div>
              </div>
            </div>
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Scale className="h-6 w-6 text-primary" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <MarkdownContent content={proposal.description} className="text-sm leading-relaxed" />

          <Separator />

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4" /> {proposal.voteCount} total vote{proposal.voteCount !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {isExpired ? 'Ended ' : 'Ends '}
              {proposal.deadline.toLocaleDateString()}
            </span>
            <span className="text-xs">
              {proposal.createdAt.toLocaleDateString()}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Legal Disclaimer ── */}
      <div className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/80 dark:bg-amber-950/30 px-4 py-3">
        <div className="flex items-center gap-3">
          <Landmark className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-xs text-amber-800/80 dark:text-amber-300/70">
            Tribes cannot entertain any proposals that violate United States Federal Law or Washington State Law.
            Tribes reserves the right to refuse any proposal, but is committed to giving a reason.
          </p>
        </div>
      </div>

      {/* ── Voting / Results ── */}
      <Card className="shadow-xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            {showResults ? (
              <Gavel className="h-5 w-5 text-primary" />
            ) : (
              <Vote className="h-5 w-5 text-primary" />
            )}
            <CardTitle className="text-lg">
              {showResults ? 'Results' : 'Cast Your Vote'}
            </CardTitle>
          </div>
          {hasVoted && isActive && (
            <CardDescription className="flex items-center gap-1 text-green-600">
              <CheckCircle2 className="h-4 w-4" /> You've already voted
            </CardDescription>
          )}
          {!hasVoted && isActive && canVote && (
            <CardDescription>You have one vote — choose wisely.</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-3">

          {/* ── Binary Up/Down Vote UI ── */}
          {showBinaryUI && !showResults && isActive ? (
            <div className="grid grid-cols-2 gap-4">
              {/* SUPPORT */}
              <button
                className={`group relative flex flex-col items-center justify-center rounded-xl border-2 p-6 transition-all duration-200 ${
                  hasVoted || !canVote
                    ? 'opacity-60 cursor-not-allowed border-muted'
                    : 'border-green-200 dark:border-green-800 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 cursor-pointer active:scale-[0.98]'
                } ${voting === supportOpt!.id ? 'animate-pulse border-green-500' : ''}`}
                onClick={() => { if (canVote && !hasVoted && !voting) handleVote(supportOpt!.id); }}
                disabled={!!voting || hasVoted || !canVote}
              >
                {voting === supportOpt!.id ? (
                  <Loader2 className="h-10 w-10 animate-spin text-green-500 mb-2" />
                ) : (
                  <ThumbsUp className={`h-10 w-10 mb-2 transition-transform ${
                    canVote && !hasVoted ? 'text-green-500 group-hover:scale-110' : 'text-muted-foreground'
                  }`} />
                )}
                <span className="font-semibold text-sm">{supportOpt!.label}</span>
              </button>

              {/* OPPOSE */}
              <button
                className={`group relative flex flex-col items-center justify-center rounded-xl border-2 p-6 transition-all duration-200 ${
                  hasVoted || !canVote
                    ? 'opacity-60 cursor-not-allowed border-muted'
                    : 'border-red-200 dark:border-red-800 hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer active:scale-[0.98]'
                } ${voting === opposeOpt!.id ? 'animate-pulse border-red-500' : ''}`}
                onClick={() => { if (canVote && !hasVoted && !voting) handleVote(opposeOpt!.id); }}
                disabled={!!voting || hasVoted || !canVote}
              >
                {voting === opposeOpt!.id ? (
                  <Loader2 className="h-10 w-10 animate-spin text-red-500 mb-2" />
                ) : (
                  <ThumbsDown className={`h-10 w-10 mb-2 transition-transform ${
                    canVote && !hasVoted ? 'text-red-400 group-hover:scale-110' : 'text-muted-foreground'
                  }`} />
                )}
                <span className="font-semibold text-sm">{opposeOpt!.label}</span>
              </button>
            </div>
          ) : null}

          {/* ── Ternary Up/Down/Revise Vote UI ── */}
          {showTernaryUI && !showResults && isActive ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* SUPPORT */}
              <button
                className={`group relative flex flex-col items-center justify-center rounded-xl border-2 p-6 transition-all duration-200 ${
                  hasVoted || !canVote
                    ? 'opacity-60 cursor-not-allowed border-muted'
                    : 'border-green-200 dark:border-green-900/30 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 cursor-pointer active:scale-[0.98]'
                } ${voting === supportOpt!.id ? 'animate-pulse border-green-500' : ''}`}
                onClick={() => { if (canVote && !hasVoted && !voting) handleVote(supportOpt!.id); }}
                disabled={!!voting || hasVoted || !canVote}
              >
                {voting === supportOpt!.id ? (
                  <Loader2 className="h-10 w-10 animate-spin text-green-500 mb-2" />
                ) : (
                  <ThumbsUp className={`h-10 w-10 mb-2 transition-transform ${
                    canVote && !hasVoted ? 'text-green-500 group-hover:scale-110' : 'text-muted-foreground'
                  }`} />
                )}
                <span className="font-semibold text-sm text-center">{supportOpt!.label}</span>
              </button>

              {/* REVISE / SEND BACK */}
              <button
                className={`group relative flex flex-col items-center justify-center rounded-xl border-2 p-6 transition-all duration-200 ${
                  hasVoted || !canVote
                    ? 'opacity-60 cursor-not-allowed border-muted'
                    : 'border-amber-200 dark:border-amber-900/30 hover:border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 cursor-pointer active:scale-[0.98]'
                } ${voting === reviseOpt!.id ? 'animate-pulse border-amber-500' : ''}`}
                onClick={() => { if (canVote && !hasVoted && !voting) handleVote(reviseOpt!.id); }}
                disabled={!!voting || hasVoted || !canVote}
              >
                {voting === reviseOpt!.id ? (
                  <Loader2 className="h-10 w-10 animate-spin text-amber-500 mb-2" />
                ) : (
                  <RotateCcw className={`h-10 w-10 mb-2 transition-transform ${
                    canVote && !hasVoted ? 'text-amber-500 group-hover:scale-110' : 'text-muted-foreground'
                  }`} />
                )}
                <span className="font-semibold text-sm text-center">{reviseOpt!.label}</span>
              </button>

              {/* OPPOSE */}
              <button
                className={`group relative flex flex-col items-center justify-center rounded-xl border-2 p-6 transition-all duration-200 ${
                  hasVoted || !canVote
                    ? 'opacity-60 cursor-not-allowed border-muted'
                    : 'border-red-200 dark:border-red-800 hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer active:scale-[0.98]'
                } ${voting === opposeOpt!.id ? 'animate-pulse border-red-500' : ''}`}
                onClick={() => { if (canVote && !hasVoted && !voting) handleVote(opposeOpt!.id); }}
                disabled={!!voting || hasVoted || !canVote}
              >
                {voting === opposeOpt!.id ? (
                  <Loader2 className="h-10 w-10 animate-spin text-red-500 mb-2" />
                ) : (
                  <ThumbsDown className={`h-10 w-10 mb-2 transition-transform ${
                    canVote && !hasVoted ? 'text-red-400 group-hover:scale-110' : 'text-muted-foreground'
                  }`} />
                )}
                <span className="font-semibold text-sm text-center">{opposeOpt!.label}</span>
              </button>
            </div>
          ) : null}

          {/* ── Binary Results View ── */}
          {showBinaryUI && showResults ? (
            <div className="space-y-4">
              {/* Support bar */}
              <div className={`rounded-lg border p-4 transition-all ${
                proposal.userVoteOptionId === supportOpt!.id
                  ? 'border-green-500/50 bg-green-50/50 dark:bg-green-900/10 ring-1 ring-green-500/20'
                  : 'border-border'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <ThumbsUp className="h-5 w-5 text-green-500" />
                    <span className="font-semibold text-sm">{supportOpt!.label}</span>
                    {proposal.userVoteOptionId === supportOpt!.id && (
                      <Badge variant="outline" className="text-[10px] border-green-300 text-green-700 dark:text-green-300">Your vote</Badge>
                    )}
                    {supportOpt!.id === winningOption?.id && proposal.voteCount > 0 && (
                      <Badge className="text-[10px] bg-green-600 text-white">Leading</Badge>
                    )}
                  </div>
                  <span className="text-sm font-mono font-bold text-green-700 dark:text-green-300">
                    {supportOpt!.percentage}% <span className="text-xs text-muted-foreground">({supportOpt!.voteCount})</span>
                  </span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${supportOpt!.percentage}%` }}
                  />
                </div>
              </div>

              {/* Oppose bar */}
              <div className={`rounded-lg border p-4 transition-all ${
                proposal.userVoteOptionId === opposeOpt!.id
                  ? 'border-red-500/50 bg-red-50/50 dark:bg-red-900/10 ring-1 ring-red-500/20'
                  : 'border-border'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <ThumbsDown className="h-5 w-5 text-red-400" />
                    <span className="font-semibold text-sm">{opposeOpt!.label}</span>
                    {proposal.userVoteOptionId === opposeOpt!.id && (
                      <Badge variant="outline" className="text-[10px] border-red-300 text-red-700 dark:text-red-300">Your vote</Badge>
                    )}
                    {opposeOpt!.id === winningOption?.id && proposal.voteCount > 0 && (
                      <Badge className="text-[10px] bg-red-600 text-white">Leading</Badge>
                    )}
                  </div>
                  <span className="text-sm font-mono font-bold text-red-700 dark:text-red-300">
                    {opposeOpt!.percentage}% <span className="text-xs text-muted-foreground">({opposeOpt!.voteCount})</span>
                  </span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-red-400 to-rose-500 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${opposeOpt!.percentage}%` }}
                  />
                </div>
              </div>

              {/* Remaining options (option 3+) */}
              {proposal.options.filter(o => o.id !== supportOpt!.id && o.id !== opposeOpt!.id).map(opt => (
                <div key={opt.id} className={`rounded-lg border p-4 ${
                  proposal.userVoteOptionId === opt.id ? 'border-primary bg-primary/5' : ''
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{opt.label}</span>
                      {opt.id === proposal.userVoteOptionId && <Badge variant="outline" className="text-[10px]">Your vote</Badge>}
                    </div>
                    <span className="text-sm font-mono font-bold">
                      {opt.percentage}% <span className="text-xs text-muted-foreground">({opt.voteCount})</span>
                    </span>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/70 rounded-full transition-all duration-500"
                      style={{ width: `${opt.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {/* ── Ternary Results View ── */}
          {showTernaryUI && showResults ? (
            <div className="space-y-4">
              {/* Support bar */}
              <div className={`rounded-lg border p-4 transition-all ${
                proposal.userVoteOptionId === supportOpt!.id
                  ? 'border-green-500/50 bg-green-50/50 dark:bg-green-900/10 ring-1 ring-green-500/20'
                  : 'border-border'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <ThumbsUp className="h-5 w-5 text-green-500 shrink-0" />
                    <span className="font-semibold text-sm truncate">{supportOpt!.label}</span>
                  </div>
                  <span className="text-sm font-mono font-bold text-green-700 dark:text-green-300 shrink-0 ml-3">
                    {supportOpt!.percentage}% <span className="text-xs text-muted-foreground">({supportOpt!.voteCount})</span>
                  </span>
                </div>
                {(proposal.userVoteOptionId === supportOpt!.id || (supportOpt!.id === winningOption?.id && proposal.voteCount > 0)) && (
                  <div className="flex items-center gap-1.5 ml-7 mb-1">
                    {proposal.userVoteOptionId === supportOpt!.id && (
                      <span className="text-[10px] font-medium text-green-600 dark:text-green-400">✓ Your vote</span>
                    )}
                    {supportOpt!.id === winningOption?.id && proposal.voteCount > 0 && (
                      <span className="text-[10px] font-semibold text-green-600 dark:text-green-400">· Leading</span>
                    )}
                  </div>
                )}
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${supportOpt!.percentage}%` }}
                  />
                </div>
              </div>

              {/* Revise bar */}
              <div className={`rounded-lg border p-4 transition-all ${
                proposal.userVoteOptionId === reviseOpt!.id
                  ? 'border-amber-500/50 bg-amber-50/50 dark:bg-amber-900/10 ring-1 ring-amber-500/20'
                  : 'border-border'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <RotateCcw className="h-5 w-5 text-amber-500 shrink-0" />
                    <span className="font-semibold text-sm truncate">{reviseOpt!.label}</span>
                  </div>
                  <span className="text-sm font-mono font-bold text-amber-700 dark:text-amber-300 shrink-0 ml-3">
                    {reviseOpt!.percentage}% <span className="text-xs text-muted-foreground">({reviseOpt!.voteCount})</span>
                  </span>
                </div>
                {(proposal.userVoteOptionId === reviseOpt!.id || (reviseOpt!.id === winningOption?.id && proposal.voteCount > 0)) && (
                  <div className="flex items-center gap-1.5 ml-7 mb-1">
                    {proposal.userVoteOptionId === reviseOpt!.id && (
                      <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">✓ Your vote</span>
                    )}
                    {reviseOpt!.id === winningOption?.id && proposal.voteCount > 0 && (
                      <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">· Leading</span>
                    )}
                  </div>
                )}
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${reviseOpt!.percentage}%` }}
                  />
                </div>
              </div>

              {/* Oppose bar */}
              <div className={`rounded-lg border p-4 transition-all ${
                proposal.userVoteOptionId === opposeOpt!.id
                  ? 'border-red-500/50 bg-red-50/50 dark:bg-red-900/10 ring-1 ring-red-500/20'
                  : 'border-border'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <ThumbsDown className="h-5 w-5 text-red-400 shrink-0" />
                    <span className="font-semibold text-sm truncate">{opposeOpt!.label}</span>
                  </div>
                  <span className="text-sm font-mono font-bold text-red-700 dark:text-red-300 shrink-0 ml-3">
                    {opposeOpt!.percentage}% <span className="text-xs text-muted-foreground">({opposeOpt!.voteCount})</span>
                  </span>
                </div>
                {(proposal.userVoteOptionId === opposeOpt!.id || (opposeOpt!.id === winningOption?.id && proposal.voteCount > 0)) && (
                  <div className="flex items-center gap-1.5 ml-7 mb-1">
                    {proposal.userVoteOptionId === opposeOpt!.id && (
                      <span className="text-[10px] font-medium text-red-600 dark:text-red-400">✓ Your vote</span>
                    )}
                    {opposeOpt!.id === winningOption?.id && proposal.voteCount > 0 && (
                      <span className="text-[10px] font-semibold text-red-600 dark:text-red-400">· Leading</span>
                    )}
                  </div>
                )}
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-red-400 to-rose-500 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${opposeOpt!.percentage}%` }}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {/* ── Multi-option fallback (not binary or ternary) ── */}
          {!showBinaryUI && !showTernaryUI && proposal.options.map(opt => {
            const isUserChoice = opt.id === proposal.userVoteOptionId;
            const isWinner = showResults && opt.id === winningOption?.id && proposal.voteCount > 0;
            const isVotingThis = voting === opt.id;

            return (
              <div key={opt.id} className={`rounded-lg border p-3 transition-all ${
                isUserChoice ? 'border-primary bg-primary/5' :
                isWinner ? 'border-green-500/50 bg-green-50/50 dark:bg-green-900/10' :
                'hover:border-primary/50'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{opt.label}</span>
                    {isUserChoice && <Badge variant="outline" className="text-xs">Your vote</Badge>}
                    {isWinner && <Badge className="text-xs bg-green-600">Leading</Badge>}
                  </div>
                  {showResults ? (
                    <span className="text-sm font-mono font-bold">
                      {opt.percentage}% <span className="text-xs text-muted-foreground">({opt.voteCount})</span>
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant={canVote ? 'default' : 'outline'}
                      disabled={!!voting || hasVoted || !canVote}
                      onClick={(e) => { e.stopPropagation(); handleVote(opt.id); }}
                    >
                      {isVotingThis ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Vote'}
                    </Button>
                  )}
                </div>
                {showResults && (
                  <Progress value={opt.percentage} className="h-2" />
                )}
              </div>
            );
          })}

          {/* Free user CTA */}
          {isFree && isActive && !hasVoted && (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed bg-muted/30 mt-4">
              <Lock className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Voting requires a Co-Op membership</p>
                <p className="text-xs text-muted-foreground">Upgrade to participate in platform governance.</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => router.push('/billing')}>
                <Sparkles className="mr-1 h-3 w-3" /> Upgrade
              </Button>
            </div>
          )}

          {/* Earned member CTA — they have membership but voting requires paid */}
          {isEarned && isActive && !hasVoted && (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800 mt-4">
              <Vote className="h-5 w-5 text-amber-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Voting requires a paid membership</p>
                <p className="text-xs text-muted-foreground">Earned memberships include most features, but governance rights require a paid Co-Op plan ($7/mo).</p>
              </div>
              <Button size="sm" variant="default" onClick={() => router.push('/billing')}>
                <Sparkles className="mr-1 h-3 w-3" /> Unlock Voting
              </Button>
            </div>
          )}
        </CardContent>

        {/* Admin/Creator Controls */}
        {(isAdmin || isCreator) && isActive && (
          <CardFooter className="gap-2 border-t pt-4">
            <Button variant="outline" onClick={handleClose} disabled={actionLoading}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Close Voting
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={actionLoading}>
              <XCircle className="mr-2 h-4 w-4" /> Cancel Proposal
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* ── Discussion Thread ── */}
      <ProposalDiscussion
        proposalId={proposal.id}
        currentUserId={user?.id}
        isAdmin={isAdmin}
      />

      {/* ── How It Works ── */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <Gavel className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-muted-foreground">How Co-Op Governance Works</h3>
          </div>
          <div className="grid gap-2 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <span className="font-mono text-primary font-bold">1.</span>
              <span>Each member gets <strong>one vote</strong> per proposal — up or down.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-mono text-primary font-bold">2.</span>
              <span>Only paid or founding Co-Op members can vote.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-mono text-primary font-bold">3.</span>
              <span>Proposals auto-close at their deadline. Results are final.</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
