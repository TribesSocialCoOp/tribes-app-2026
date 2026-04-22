
"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { ArrowLeft, Users, MessageSquare, TrendingUp, BarChart2 as BarChartIcon, ShieldAlert, Loader2 } from 'lucide-react';
import { AreaChart, BarChart, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, Area, Bar, ResponsiveContainer } from 'recharts';
import { type Tribe } from '@/lib/types';
import { getTribeById, getTribeAnalytics } from '@/lib/actions/tribe-actions';
import type { TribeAnalytics } from '@/lib/services/tribe-service';

export default function AnalyticsPage() {
  const router = useRouter();
  const params = useParams();
  const tribeId = params.tribeId as string;
  const [tribe, setTribe] = useState<Tribe | null>(null);
  const [analytics, setAnalytics] = useState<TribeAnalytics | null>(null);
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
        <Button variant="outline" size="sm" onClick={() => router.push(`/tribes/${tribeId}`)}>
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
    </div>
  );
}
