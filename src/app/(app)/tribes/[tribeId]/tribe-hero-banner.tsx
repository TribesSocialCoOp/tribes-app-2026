"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useGoBack } from '@/hooks/use-go-back';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveMenu,
  ResponsiveMenuContent,
  ResponsiveMenuItem,
  ResponsiveMenuSeparator,
  ResponsiveMenuTrigger,
} from "@/components/ui/responsive-menu";
import { ArrowLeft, Users, Link2, UserPlus, Settings, MoreVertical, LogOut, Share2, Loader2, Clock } from "lucide-react";
import { moodsData } from '@/lib/moods-data';
import { useTribeDetail } from './tribe-detail-context';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import { ShareLinkCard } from '@/components/ui/share-link-card';
import { getOrCreatePersonalInviteCode } from '@/lib/actions/profile-actions';
import { useToast } from '@/hooks/use-toast';

/** Shift a hex color's hue by `deg` degrees to create a gradient companion. */
function shiftHue(hex: string, deg: number): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  h = ((h * 360 + deg) % 360) / 360;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(hue2rgb(p, q, h + 1/3))}${toHex(hue2rgb(p, q, h))}${toHex(hue2rgb(p, q, h - 1/3))}`;
}

export function TribeHeroBanner() {
  const router = useRouter();
  const goBack = useGoBack();
  const { state, tribeId, isTribeAdmin, handleInitiateJoinTribe, handleLeaveTribe } = useTribeDetail();
  const { tribe, isMember, isJoining } = state;
  const { toast } = useToast();

  const [shareLink, setShareLink] = useState<string | null>(null);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);

  if (!tribe) return null;

  const tribeMoodObjects = tribe.moods?.map((slug: string) => moodsData.find(m => m.slug === slug)).filter(Boolean) || [];

  const handleShareTribe = async () => {
    setIsGeneratingShare(true);
    try {
      const inviteCode = await getOrCreatePersonalInviteCode();
      const baseUrl = window.location.origin;
      const tribeUrl = tribe.inviteToken
        ? `${baseUrl}/invite/${tribe.inviteToken}?invite=${inviteCode}`
        : `${baseUrl}/t/${tribe.slug || tribeId}?invite=${inviteCode}`;
      setShareLink(tribeUrl);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to generate share link',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingShare(false);
    }
  };

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden shadow-xl relative">
        <div className="absolute top-4 left-4 z-10">
          <Button variant="outline" size="icon" onClick={goBack} className="bg-background/70 hover:bg-background/90 backdrop-blur-sm">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </div>
        {isMember && (
          <div className="absolute top-4 right-4 z-10">
            <ResponsiveMenu>
              <ResponsiveMenuTrigger asChild>
                <Button variant="outline" size="icon" className="bg-background/70 hover:bg-background/90 backdrop-blur-sm">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </ResponsiveMenuTrigger>
              <ResponsiveMenuContent align="end">
                <ResponsiveMenuItem onClick={handleShareTribe} disabled={isGeneratingShare}>
                  {isGeneratingShare ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
                  Share Tribe
                </ResponsiveMenuItem>
                {isTribeAdmin && (
                  <>
                    <ResponsiveMenuSeparator />
                    <ResponsiveMenuItem onClick={() => router.push(`/t/${state.tribe?.slug || tribeId}/settings`)}>
                      <Settings className="mr-2 h-4 w-4" /> Tribe Settings
                    </ResponsiveMenuItem>
                  </>
                )}
                <ResponsiveMenuSeparator />
                <ResponsiveMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={handleLeaveTribe}
                >
                  <LogOut className="mr-2 h-4 w-4" /> Leave Tribe
                </ResponsiveMenuItem>
              </ResponsiveMenuContent>
            </ResponsiveMenu>
          </div>
        )}
        <div className="relative h-48 md:h-64 w-full">
          {tribe.cover ? (
            <Image
              src={tribe.cover}
              alt={`${tribe.name} cover image`}
              fill
              style={{ objectFit: "cover", objectPosition: tribe.coverPosition || "center" }}
              data-ai-hint={tribe.dataAiHint || "community group"}
              priority
            />
          ) : (
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(135deg, ${tribe.brandColor || '#6366f1'}, ${shiftHue(tribe.brandColor || '#6366f1', 40)})`,
              }}
            >
              {/* Subtle pattern overlay */}
              <div className="absolute inset-0 opacity-[0.07]" style={{
                backgroundImage: 'radial-gradient(circle at 25% 25%, white 1px, transparent 1px), radial-gradient(circle at 75% 75%, white 1px, transparent 1px)',
                backgroundSize: '32px 32px',
              }} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
        </div>
        <CardHeader className="relative -mt-16 z-10 p-4 md:p-6 bg-transparent">
          <CardTitle className="text-3xl md:text-4xl font-bold text-white font-mono tracking-tight drop-shadow-lg flex items-center gap-2">
            {tribe.name}
            {state.isOwnerVerified && <VerifiedBadge size="lg" className="text-blue-400 drop-shadow-lg" />}
          </CardTitle>
          <div className="flex items-center space-x-3 pt-1">
            <Badge variant={tribe.isPublic ? "secondary" : "destructive"} className="text-xs py-1 px-2 backdrop-blur-sm bg-black/30 text-white border-white/50">
              {tribe.isPublic ? "Public Tribe" : "Private Tribe"}
            </Badge>
            <div className="flex items-center text-sm text-white drop-shadow-md">
              <Users className="h-4 w-4 mr-1.5" /> {tribe.members} members
            </div>
            {tribe.homepageUrl && (
              <a href={tribe.homepageUrl} target="_blank" rel="noopener noreferrer" className="flex items-center text-sm text-white hover:text-primary-foreground hover:underline drop-shadow-md transition-colors">
                <Link2 className="h-4 w-4 mr-1.5" /> Website
              </a>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-2">
          <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{tribe.description}</p>
          {tribeMoodObjects.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {tribeMoodObjects.map((mood: any) => mood && (
                <Badge key={mood.slug} variant="outline" className={`border-current ${mood.textClass} ${mood.bgClass}/30`}>
                  {mood.emoji} {mood.name}
                </Badge>
              ))}
            </div>
          )}
          {!isMember && tribe.isPublic && (
            <div className="mt-4 pt-4 border-t">
              {state.isPending ? (
                <>
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <Clock className="h-5 w-5" />
                    <span className="font-semibold">Join Request Pending</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Your request to join {tribe.name} is being reviewed by the tribe admins. You'll be notified when they respond.
                  </p>
                </>
              ) : (
                <>
                  <Button onClick={handleInitiateJoinTribe} disabled={isJoining}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    {isJoining ? 'Joining...' : 'Join Tribe'}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    {tribe.joinMechanism === 'approval' ? 'Your request will be sent to the tribe admins for approval.' : 'You can join this tribe immediately.'}
                  </p>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {shareLink && (
        <ShareLinkCard
          url={shareLink}
          title={`Join ${tribe.name} on Tribes`}
          onDismiss={() => setShareLink(null)}
        />
      )}
    </div>
  );
}
