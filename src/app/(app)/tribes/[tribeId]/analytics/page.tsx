
"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTribeIdFromParams } from '@/hooks/use-tribe-id';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Users, MessageSquare, TrendingUp, BarChart2 as BarChartIcon, ShieldAlert, Loader2, Sparkles, Activity, Image as ImageIcon, FileText } from 'lucide-react';
import { AreaChart, BarChart, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, Area, Bar, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { type Tribe } from '@/lib/types';
import { getTribeById, getTribeAnalytics, getAdvancedTribeAnalytics } from '@/lib/actions/tribe-actions';
import type { TribeAnalytics, AdvancedTribeAnalytics } from '@/lib/services/tribe-service';
import { AuthGuard } from "@/components/providers/auth-guard";

const PIE_COLORS = ['hsl(var(--primary))', 'hsl(var(--muted-foreground))'];

export default function AnalyticsPage() {
  return (
    <AuthGuard message="Sign in to view tribe engagement analytics.">
      <AnalyticsContent />
    </AuthGuard>
  );
}

function AnalyticsContent() {
  const router = useRouter();
  const { tribeId } = useTribeIdFromParams();
  const [tribe, setTribe] = useState<Tribe | null>(null);
  const [analytics, setAnalytics] = useState<TribeAnalytics | null>(null);
  const [advanced, setAdvanced] = useState<AdvancedTribeAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tribeId) return;

    async function fetchData() {
      try {
        const [tribeData, analyticsData] = await Promise.all([
          getTribeById(tribeId),
          getTribeAnalytics(tribeId),
        ]);
        setTribe(tribeData);
        setAnalytics(analyticsData);

        // Load advanced analytics (returns null if feature not available)
        const advData = await getAdvancedTribeAnalytics(tribeId);
        setAdvanced(advData);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load analytics';
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [tribeId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-height,4rem)-2rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="max-w-xl mx-auto mt-8 shadow-lg">
        <CardHeader className="text-center">
            <ShieldAlert className="h-16 w-16 text-destructive mx-auto mb-4"/>
            <CardTitle className="text-2xl font-bold">Access Denied</CardTitle>
            <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardFooter className="flex justify-center">
            <Button onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
            </Button>
        </CardFooter>
      </Card>
    );
  }

  if (!tribe || !analytics) {
    return (
        <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-height,4rem)-2rem)]">
            <p className="text-muted-foreground">Tribe not found.</p>
        </div>
    );
  }

  const { stats, memberGrowth, topPosts } = analytics;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center mt-2">
        <Button variant="outline" size="sm" onClick={() => router.push(`/t/${tribe.slug}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to {tribe.name}
        </Button>
      </div>

      <header>
        <div className="flex items-center space-x-3">
          <BarChartIcon className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold font-mono tracking-normal">Engagement Analytics</h1>
            <p className="text-lg text-muted-foreground mt-1">
              Insights for the <span className="font-semibold text-primary">{tribe.name}</span> tribe.
            </p>
          </div>
        </div>
      </header>

      {/* Key Stats Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalMembers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Posts</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPosts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Engagement Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.engagementRate}</div>
            <p className="text-xs text-muted-foreground">{stats.engagementDelta !== 'N/A' ? `${stats.engagementDelta} vs prior 30d` : 'Insufficient data for delta'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Vibes/Post</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgVibesPerPost}</div>
            <p className="text-xs text-muted-foreground">{stats.vibesDelta !== 'N/A' ? `${stats.vibesDelta} vs prior 30d` : 'Insufficient data for delta'}</p>
          </CardContent>
        </Card>
      </section>

      {/* Charts Section */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Member Growth</CardTitle>
            <CardDescription>
              {memberGrowth.length > 0
                ? 'Cumulative members over the last 6 months.'
                : 'No new member activity in the last 6 months.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {memberGrowth.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={memberGrowth}>
                  <defs>
                      <linearGradient id="colorMembers" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}/>
                  <Area type="monotone" dataKey="members" stroke="hsl(var(--primary))" fill="url(#colorMembers)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No data yet — members will appear here as they join.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Posts by Engagement</CardTitle>
            <CardDescription>
              {topPosts.length > 0
                ? 'Vibes vs. Comments on top-performing posts.'
                : 'No posts yet in this tribe.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topPosts.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topPosts}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}/>
                  <Legend />
                  <Bar dataKey="vibes" fill="hsl(var(--primary))" name="Vibes" />
                  <Bar dataKey="comments" fill="hsl(var(--secondary))" name="Comments" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No data yet — posts will appear here as engagement grows.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ═══════════════ ADVANCED ANALYTICS (Org Pro+) ═══════════════ */}
      {advanced ? (
        <>
          <div className="flex items-center gap-2 pt-4">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold">Advanced Insights</h2>
            <Badge variant="secondary" className="text-xs">Org Pro+</Badge>
          </div>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Activity by Day of Week */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" /> Activity by Day</CardTitle>
                <CardDescription>Posts and vibes by day of the week.</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={advanced.activityByDayOfWeek}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}/>
                    <Legend />
                    <Bar dataKey="posts" fill="hsl(var(--primary))" name="Posts" />
                    <Bar dataKey="vibes" fill="hsl(221, 83%, 53%)" name="Vibes" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Activity by Hour */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" /> Peak Hours</CardTitle>
                <CardDescription>When your community is most active (UTC).</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={advanced.activityByHour}>
                    <defs>
                      <linearGradient id="colorHour" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.6}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} />
                    <YAxis />
                    <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} labelFormatter={(h) => `${h}:00 UTC`} />
                    <Area type="monotone" dataKey="posts" stroke="hsl(var(--primary))" fill="url(#colorHour)" name="Posts" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Retention */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Member Retention (30d)</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <div className="text-4xl font-bold text-primary">{advanced.retention.retentionRate}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {advanced.retention.activeMembers} of {advanced.retention.totalMembers} members active
                </p>
              </CardContent>
            </Card>

            {/* Content Mix */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Content Mix</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'With Image', value: advanced.contentMix.withImage },
                        { name: 'Text Only', value: advanced.contentMix.textOnly },
                      ]}
                      cx="50%" cy="50%"
                      innerRadius={40} outerRadius={60}
                      dataKey="value"
                    >
                      {PIE_COLORS.map((c, i) => <Cell key={i} fill={c} />)}
                    </Pie>
                    <RechartsTooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 text-xs mt-1">
                  <span className="flex items-center gap-1"><ImageIcon className="h-3 w-3" /> {advanced.contentMix.withImage} images</span>
                  <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {advanced.contentMix.textOnly} text</span>
                </div>
              </CardContent>
            </Card>

            {/* Top Contributors */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Top Contributors</CardTitle>
              </CardHeader>
              <CardContent>
                {advanced.topContributors.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No contributors yet.</p>
                ) : (
                  <div className="space-y-2">
                    {advanced.topContributors.slice(0, 5).map((c, i) => (
                      <div key={c.userId} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className="text-muted-foreground font-mono text-xs w-4">{i + 1}</span>
                          <span className="font-medium truncate max-w-[120px]">{c.name}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">{c.posts} posts · {c.vibes} vibes</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-4 p-4">
            <Sparkles className="h-8 w-8 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-sm">Want deeper insights?</p>
              <p className="text-xs text-muted-foreground">Upgrade to Org Pro for activity heatmaps, retention metrics, top contributors, and content mix analytics.</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => router.push('/billing')}>
              <Sparkles className="mr-1 h-3 w-3" /> Upgrade
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
