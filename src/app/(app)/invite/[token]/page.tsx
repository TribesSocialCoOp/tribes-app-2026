'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getTribeByInviteToken, requestToJoinTribe } from '@/lib/actions/tribe-actions';
import type { Tribe } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, Shield, ArrowRight, XCircle, LogIn } from 'lucide-react';
import { JoinTribeDialog } from '@/components/dialogs/join-tribe-dialog';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/components/providers/user-provider';
import { useAgeGate } from '@/components/providers/age-gate-provider';
import Link from 'next/link';

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user, isLoading: isUserLoading } = useUser();
  const { openAgeGate } = useAgeGate();
  const token = params.token as string;

  const [tribe, setTribe] = useState<Tribe | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);

  // Carry forward the ?invite= param so it reaches the signup page
  const inviteParam = searchParams.get('invite');

  useEffect(() => {
    if (!token) return;
    getTribeByInviteToken(token)
      .then(t => {
        setTribe(t);
        if (!t) setError('This invite link is invalid or has expired.');
      })
      .catch(() => setError('Failed to load invite.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleJoinClick = () => {
    if (!tribe) return;
    // If user is not logged in, redirect to signup/login with returnTo
    if (!user) {
      const returnTo = `/invite/${token}${inviteParam ? `?invite=${inviteParam}` : ''}`;
      const signupUrl = `/signup?returnTo=${encodeURIComponent(returnTo)}${inviteParam ? `&invite=${inviteParam}` : ''}`;
      router.push(signupUrl);
      return;
    }
    setIsJoinDialogOpen(true);
  };

  const handleConfirmJoin = async (selectedTribe: Tribe, selectedAlias?: string, aliasAvatar?: string) => {
    if (!tribe) return;
    setJoining(true);
    setIsJoinDialogOpen(false);
    try {
      const result = await requestToJoinTribe(tribe.id, selectedAlias, aliasAvatar);
      if (result === 'joined') {
        toast({ title: 'Welcome!', description: `You have successfully joined ${tribe.name}.` });
        router.push(`/t/${tribe.slug}`);
      } else if (result === 'pending') {
        toast({ title: 'Request Sent', description: 'Your request to join has been submitted. The tribe admins will review it.' });
        setJoining(false);
      } else if (result === 'age_required') {
        setJoining(false);
        openAgeGate({ onVerified: () => handleConfirmJoin(selectedTribe, selectedAlias, aliasAvatar) });
      } else {
        toast({ title: 'Cannot Join', description: 'You do not meet the requirements to join this tribe.', variant: 'destructive' });
        setJoining(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to join tribe.';
      // Already a member — just redirect them to the tribe
      if (msg.includes('Already a member')) {
        toast({ title: 'Already a member!', description: `You're already in ${tribe.name}. Redirecting...` });
        router.replace(`/t/${tribe.slug}`);
        return;
      }
      toast({ title: 'Error', description: msg, variant: 'destructive' });
      setJoining(false);
    }
  };

  if (loading || isUserLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !tribe) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full border-destructive/30">
          <CardContent className="pt-6 text-center space-y-4">
            <XCircle className="h-12 w-12 text-destructive/60 mx-auto" />
            <h2 className="text-xl font-semibold">Invalid Invite</h2>
            <p className="text-muted-foreground">
              {error || 'This invite link is no longer valid. Ask the tribe founder for a new one.'}
            </p>
            <Button variant="outline" onClick={() => router.push('/tribes')}>
              Browse Tribes
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLoggedIn = !!user;

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center space-y-3">
          {tribe.cover && (
            <div
              className="w-full h-32 rounded-t-lg bg-cover bg-center -mt-6 -mx-6 mb-2"
              style={{
                backgroundImage: `url(${tribe.cover})`,
                width: 'calc(100% + 3rem)',
                backgroundPosition: tribe.coverPosition || 'center',
              }}
            />
          )}
          <CardTitle className="text-2xl">{tribe.name}</CardTitle>
          <CardDescription className="text-base">{tribe.description}</CardDescription>
          <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" /> {tribe.members} members
            </span>
            {!tribe.isPublic && (
              <Badge variant="secondary" className="text-xs">
                <Shield className="h-3 w-3 mr-1" /> Private
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            You&apos;ve been invited to join this tribe.
          </p>

          {isLoggedIn ? (
            <Button
              className="w-full"
              size="lg"
              onClick={handleJoinClick}
              disabled={joining}
            >
              {joining ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Joining...</>
              ) : (
                <>Join {tribe.name} <ArrowRight className="ml-2 h-4 w-4" /></>
              )}
            </Button>
          ) : (
            <div className="space-y-3">
              <Button
                className="w-full"
                size="lg"
                onClick={handleJoinClick}
              >
                Sign Up & Join <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Already have an account?{' '}
                <Link
                  href={`/login?returnTo=${encodeURIComponent(`/invite/${token}${inviteParam ? `?invite=${inviteParam}` : ''}`)}`}
                  className="text-primary font-semibold hover:underline"
                >
                  Log In
                </Link>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <JoinTribeDialog
        isOpen={isJoinDialogOpen}
        onOpenChange={setIsJoinDialogOpen}
        tribe={tribe}
        onConfirmJoin={handleConfirmJoin}
        isJoining={joining}
      />
    </div>
  );
}
