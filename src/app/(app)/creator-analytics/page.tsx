"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, BarChart3, Users, FileText, Heart, Calendar,
  Link2, TrendingUp, Sparkles, Lock,
} from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { getCreatorAnalytics } from "@/lib/actions/profile-actions";

type CreatorData = Awaited<ReturnType<typeof getCreatorAnalytics>>;

const CONTRIBUTION_LABELS: Record<string, string> = {
  post: '📝 Post Created',
  moderation: '🛡️ Moderation',
  referral: '🤝 Referral',
  event_hosted: '🎉 Event Hosted',
  event_rsvp: '🎫 Event RSVP',
  bug_report: '🐛 Bug Report',
  tribe_created: '🏛️ Tribe Created',
};

import { AuthGuard } from '@/components/providers/auth-guard';

export default function CreatorAnalyticsPage() {
  return (
    <AuthGuard message="Sign in to view your creator analytics and engagement data.">
      <AnalyticsContent />
    </AuthGuard>
  );
}

function AnalyticsContent() {
  const router = useRouter();
  const { role, user } = useUser();
  const [data, setData] = useState<CreatorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    async function check() {
      if (!user?.id) { setLoading(false); return; }
      // Check feature via server action
      const { checkCreatorAnalyticsAccess } = await import('@/lib/actions/profile-actions');
      const allowed = await checkCreatorAnalyticsAccess();
      setHasAccess(allowed || role === 'Admin');
      if (allowed || role === 'Admin') {
        const analytics = await getCreatorAnalytics();
        setData(analytics);
      }
      setLoading(false);
    }
    check();
  }, [user?.id, role]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground animate-pulse">Loading analytics...</p>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="max-w-xl mx-auto mt-12">
        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <Lock className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <CardTitle className="text-2xl font-bold">Creator Analytics</CardTitle>
            <CardDescription className="text-base">
              Creator Analytics is available on the <strong>Creator</strong> plan and above.
              Upgrade to unlock insights into your platform activity.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
            </Button>
            <Button onClick={() => router.push('/billing')}>
              <Sparkles className="mr-2 h-4 w-4" /> Upgrade Plan
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const statCards = [
    { label: 'Total Posts', value: data.totalPosts, icon: FileText, color: 'text-blue-500' },
    { label: 'Posts (30d)', value: data.recentPosts, icon: TrendingUp, color: 'text-green-500' },
    { label: 'Total Vibes', value: data.totalVibes, icon: Heart, color: 'text-rose-500' },
    { label: 'Tribes Owned', value: data.tribesOwned, icon: Users, color: 'text-purple-500' },
    { label: 'Memberships', value: data.tribesMember, icon: Link2, color: 'text-cyan-500' },
    { label: 'Bonds', value: data.totalBonds, icon: Users, color: 'text-amber-500' },
    { label: 'Events Hosted', value: data.totalEvents, icon: Calendar, color: 'text-indigo-500' },
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center mt-2">
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <h1 className="text-2xl font-bold ml-4 flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          Creator Analytics
        </h1>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.label} className="shadow-md hover:shadow-lg transition-shadow">
            <CardContent className="p-4 flex flex-col items-center text-center gap-1">
              <s.icon className={`h-6 w-6 ${s.color} mb-1`} />
              <p className="text-2xl font-bold tracking-tight">{s.value.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Top Posts */}
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Top Performing Posts</CardTitle>
          <CardDescription>Your posts with the most engagement (vibes + comments)</CardDescription>
        </CardHeader>
        <CardContent>
          {data.topPosts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No posts yet. Start creating!</p>
          ) : (
            <div className="space-y-3">
              {data.topPosts.map((post, i) => (
                <div key={i} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-lg font-bold text-muted-foreground w-6 text-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium truncate">{post.title}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant="secondary" className="gap-1">
                      <Heart className="h-3 w-3" /> {post.vibes}
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      💬 {post.comments}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Contributions */}
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Recent Contributions</CardTitle>
          <CardDescription>Your latest community contributions and earned points</CardDescription>
        </CardHeader>
        <CardContent>
          {data.recentContributions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No contributions yet.</p>
          ) : (
            <div className="space-y-2">
              {data.recentContributions.map((c, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 border rounded-lg text-sm">
                  <span>{CONTRIBUTION_LABELS[c.type] || c.type}</span>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">+{c.points} pts</Badge>
                    {c.createdAt && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
