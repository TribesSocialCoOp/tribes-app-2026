
"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Send, Link2, Copy, Share2, UserPlus, Loader2, Check, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from '@/hooks/use-toast';
import React, { Suspense, useState, useEffect, useCallback } from "react";
import { getFamilyBonds, sendFamilyIntroductions, createFamilyInviteLink } from "@/lib/actions/bond-actions";
import type { Bond } from "@/lib/types";

function IntroduceContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const connectedFamilyMemberName = searchParams.get("name") || "this family member";
  const newMemberId = searchParams.get("memberId") || "";
  const { toast } = useToast();

  // State
  const [familyBonds, setFamilyBonds] = useState<Bond[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);

  // Invite link state
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Load real family bonds from DB
  useEffect(() => {
    const loadFamilyBonds = async () => {
      try {
        const bonds = await getFamilyBonds();
        setFamilyBonds(bonds);
      } catch {
        toast({ title: 'Error', description: 'Failed to load family members.', variant: 'destructive' });
      } finally {
        setIsLoading(false);
      }
    };
    loadFamilyBonds();
  }, [toast]);

  // Toggle selection
  const toggleMember = useCallback((bondTargetId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(bondTargetId)) {
        next.delete(bondTargetId);
      } else {
        next.add(bondTargetId);
      }
      return next;
    });
  }, []);

  // Send introductions
  const handleSendIntroductions = useCallback(async () => {
    if (selectedIds.size === 0 && !inviteUrl) {
      toast({ title: 'Select family members', description: 'Choose at least one family member to introduce, or generate an invite link.' });
      return;
    }

    setIsSending(true);
    try {
      let sentCount = 0;
      if (selectedIds.size > 0 && newMemberId) {
        sentCount = await sendFamilyIntroductions(newMemberId, Array.from(selectedIds));
      }

      router.push(`/family/complete?name=${encodeURIComponent(connectedFamilyMemberName)}&count=${sentCount}${inviteUrl ? '&invited=true' : ''}`);
    } catch (err: unknown) {
      toast({ title: 'Error', description: ((err instanceof Error) ? err.message : 'An error occurred') || 'Failed to send introductions.', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  }, [selectedIds, newMemberId, connectedFamilyMemberName, inviteUrl, router, toast]);

  // Generate invite link
  const handleGenerateInviteLink = useCallback(async () => {
    setIsGeneratingLink(true);
    try {
      const result = await createFamilyInviteLink();
      const fullUrl = `${window.location.origin}${result.url}`;
      setInviteUrl(fullUrl);
      toast({ title: 'Invite link created!', description: `Expires at ${result.expiresAt.toLocaleTimeString()}` });
    } catch (err: unknown) {
      toast({ title: 'Error', description: ((err instanceof Error) ? err.message : 'An error occurred') || 'Failed to generate invite link.', variant: 'destructive' });
    } finally {
      setIsGeneratingLink(false);
    }
  }, [toast]);

  // Copy link to clipboard
  const handleCopyLink = useCallback(async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast({ title: 'Copy failed', description: 'Could not copy link to clipboard.' });
    }
  }, [inviteUrl, toast]);

  // Web Share API
  const handleShare = useCallback(async () => {
    if (!inviteUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join my family on Tribes.app',
          text: `${connectedFamilyMemberName} is inviting you to connect on Tribes.app!`,
          url: inviteUrl,
        });
      } catch {
        // User cancelled share — no action needed
      }
    } else {
      handleCopyLink();
    }
  }, [inviteUrl, connectedFamilyMemberName, handleCopyLink]);

  // Derive the target IDs from family bonds
  // We need access to the raw bond rows to get targetId — use the bond ID mapping
  const getInitials = (name: string) => {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <>
      <CardHeader>
        <Button asChild variant="ghost" size="sm" className="absolute top-4 left-4 text-muted-foreground hover:text-foreground">
          <Link href={`/family/start?name=${encodeURIComponent(connectedFamilyMemberName)}${newMemberId ? `&memberId=${encodeURIComponent(newMemberId)}` : ''}`}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Link>
        </Button>
        <CardTitle className="text-2xl md:text-3xl font-bold font-mono text-center pt-8 md:pt-2">Introduce {connectedFamilyMemberName}</CardTitle>
        <CardDescription className="text-md text-muted-foreground text-center pt-1">
          Select existing family members or invite new ones to connect with {connectedFamilyMemberName}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Existing Family Members */}
        <div>
          <h3 className="text-lg font-semibold mb-3 text-foreground flex items-center gap-2">
            <Users className="h-5 w-5" /> Select Existing Family:
          </h3>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : familyBonds.length === 0 ? (
            <div className="text-center py-6 px-4 rounded-md border border-dashed">
              <p className="text-sm text-muted-foreground">
                You haven&apos;t formed any family bonds yet. Use the invite link below to bring family members onto the platform.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {familyBonds.map((bond) => (
                <Label
                  key={bond.id}
                  htmlFor={`fam-member-${bond.id}`}
                  className="flex items-center space-x-3 p-3 border rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <Checkbox
                    id={`fam-member-${bond.id}`}
                    checked={selectedIds.has(bond.id)}
                    onCheckedChange={() => toggleMember(bond.id)}
                  />
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{getInitials(bond.targetName)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium flex-1">
                    {bond.targetName}
                  </span>
                </Label>
              ))}
            </div>
          )}
        </div>

        {/* Invite New Family Member */}
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <UserPlus className="h-5 w-5" /> Invite New Family Member:
          </h3>

          {inviteUrl ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/30">
                <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <code className="text-xs break-all flex-1 text-muted-foreground">{inviteUrl}</code>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={handleCopyLink}
                >
                  {linkCopied ? <Check className="mr-2 h-4 w-4 text-green-600" /> : <Copy className="mr-2 h-4 w-4" />}
                  {linkCopied ? 'Copied!' : 'Copy Link'}
                </Button>
                {'share' in navigator && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={handleShare}
                  >
                    <Share2 className="mr-2 h-4 w-4" /> Share
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                This link creates a family bond when opened. It expires in 5 minutes.
              </p>
            </div>
          ) : (
            <>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleGenerateInviteLink}
                disabled={isGeneratingLink}
              >
                {isGeneratingLink ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="mr-2 h-4 w-4" />
                )}
                Generate Family Invite Link
              </Button>
              <p className="text-xs text-muted-foreground px-1">
                Create a shareable link for family members who aren&apos;t on the platform yet.
              </p>
            </>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-3 pt-6">
        <Button
          className="w-full"
          size="lg"
          onClick={handleSendIntroductions}
          disabled={isSending || (selectedIds.size === 0 && !inviteUrl)}
        >
          {isSending ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <Send className="mr-2 h-5 w-5" />
          )}
          {selectedIds.size > 0
            ? `Send ${selectedIds.size} Introduction${selectedIds.size > 1 ? 's' : ''}`
            : inviteUrl
              ? 'Continue'
              : 'Select family members above'
          }
        </Button>
      </CardFooter>
    </>
  );
}

export default function FamilyOnboardingIntroducePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <IntroduceContent />
    </Suspense>
  );
}
