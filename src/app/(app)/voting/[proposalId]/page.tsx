"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, Vote, Clock, Users, CheckCircle2, XCircle,
  Loader2, Lock, Sparkles, AlertTriangle,
} from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";
import { getProposalById, castVote, closeProposal, cancelProposal } from "@/lib/actions/voting-actions";
import { getMySubscription } from "@/lib/actions/profile-actions";
import type { Proposal } from "@/lib/services/voting-service";

import { AuthGuard } from '@/components/providers/auth-guard';

export default function ProposalDetailPage() {
  return (
    <AuthGuard message="Sign in to view proposal details and cast your vote.">
      <ProposalDetailContent />
    </AuthGuard>
  );
}

function ProposalDetailContent() {
  const router = useRouter();
  const params = useParams();
  const proposalId = params.proposalId as string;
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

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center mt-2">
        <Button variant="outline" size="sm" onClick={() => router.push('/voting')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> All Proposals
        </Button>
      </div>

      {/* Proposal Header */}
      <Card className="shadow-xl">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <CardTitle className="text-xl font-bold">{proposal.title}</CardTitle>
                <Badge
                  variant={proposal.status === 'active' ? 'default' : proposal.status === 'closed' ? 'secondary' : 'destructive'}
                  className="capitalize shrink-0"
                >
                  {proposal.status}
                </Badge>
              </div>
              <CardDescription className="text-sm">
                Proposed by <span className="font-medium">{proposal.creatorName}</span>
                {' · '}
                {proposal.createdAt.toLocaleDateString()}
              </CardDescription>
            </div>
            <Vote className="h-8 w-8 text-primary shrink-0" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed">{proposal.description}</p>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4" /> {proposal.voteCount} total votes
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {isExpired ? 'Ended ' : 'Ends '}
              {proposal.deadline.toLocaleDateString()}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Voting / Results */}
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-lg">
            {showResults ? 'Results' : 'Cast Your Vote'}
          </CardTitle>
          {hasVoted && isActive && (
            <CardDescription className="flex items-center gap-1 text-green-600">
              <CheckCircle2 className="h-4 w-4" /> You've already voted
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {proposal.options.map(opt => {
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
    </div>
  );
}
