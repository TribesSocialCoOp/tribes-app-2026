'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Link from 'next/link';
import { Search, Loader2, ArrowLeft, Calendar, ShieldAlert, CheckCircle2, Clock, AlertCircle, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

const searchSchema = z.object({
  tracking: z.string().min(1, 'Tracking number is required').trim(),
  email: z.string().email('Please enter a valid email address').trim(),
});

type FormValues = z.infer<typeof searchSchema>;

interface ReportStatusInfo {
  trackingNumber: string;
  status: 'pending' | 'in_review' | 'removed' | 'rejected' | 'requires_info';
  createdAt: string;
  slaDeadline: string;
  actionTaken: 'content_removed' | 'content_not_found' | 'insufficient_info' | 'not_ncii' | null;
  reviewedAt: string | null;
}

export default function NciiStatusPage() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [statusInfo, setStatusInfo] = useState<ReportStatusInfo | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      tracking: '',
      email: '',
    },
  });

  async function onSubmit(values: FormValues) {
    setIsLoading(true);
    setStatusInfo(null);

    try {
      const queryParams = new URLSearchParams({
        tracking: values.tracking,
        email: values.email,
      });

      const response = await fetch(`/api/ncii/status?${queryParams.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Status lookup failed');
      }

      setStatusInfo(data);
    } catch (error: any) {
      console.error('Lookup error:', error);
      toast({
        variant: 'destructive',
        title: 'Report Not Found',
        description: error.message || 'We could not find a report matching that tracking number and email address.',
      });
    } finally {
      setIsLoading(false);
    }
  }

  // Get status color and badge details
  const getStatusConfig = (status: ReportStatusInfo['status']) => {
    switch (status) {
      case 'pending':
        return {
          label: 'Pending Review',
          colorClass: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
          icon: <Clock className="h-5 w-5 text-amber-500" />,
          desc: 'Your report has been successfully submitted and is queued for immediate review. An agent is being assigned.',
        };
      case 'in_review':
        return {
          label: 'Under Active Investigation',
          colorClass: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
          icon: <Loader2 className="h-5 w-5 text-indigo-500 animate-spin" />,
          desc: 'A dedicated Trust & Safety officer is currently verifying the content. Content is being scanned for matches.',
        };
      case 'removed':
        return {
          label: 'Content Resolved & Blocked',
          colorClass: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
          icon: <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
          desc: 'The reported intimate imagery was successfully identified, permanently removed, and its hash added to our blocklist.',
        };
      case 'rejected':
        return {
          label: 'Review Completed (No Action)',
          colorClass: 'text-muted-foreground bg-muted border-border',
          icon: <XCircle className="h-5 w-5 text-muted-foreground" />,
          desc: 'Our review team determined the reported content does not violate NCII policies, or the content was not found.',
        };
      case 'requires_info':
        return {
          label: 'Additional Information Requested',
          colorClass: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
          icon: <AlertCircle className="h-5 w-5 text-rose-500 animate-bounce" />,
          desc: 'Our team needs additional context (e.g. valid links or descriptions) to act. Please check your inbox for an email from us.',
        };
    }
  };

  const getActionTakenLabel = (action: ReportStatusInfo['actionTaken']) => {
    switch (action) {
      case 'content_removed':
        return 'The reported content was permanently removed, and its perceptual hash was blocklisted to prevent future uploads.';
      case 'content_not_found':
        return 'No matching content could be located based on the details provided.';
      case 'insufficient_info':
        return 'The details provided were insufficient to locate or verify the reported content.';
      case 'not_ncii':
        return 'The content was determined to be outside the scope of our Non-Consensual Intimate Imagery policy.';
      default:
        return null;
    }
  };

  const getTimelineSteps = (currentStatus: ReportStatusInfo['status']) => {
    const steps = [
      { id: 'submitted', label: 'Report Submitted', done: true },
      {
        id: 'review',
        label: 'In Review',
        done: currentStatus !== 'pending',
        active: currentStatus === 'in_review',
      },
      {
        id: 'resolved',
        label: 'Resolution',
        done: ['removed', 'rejected', 'requires_info'].includes(currentStatus),
        active: ['removed', 'rejected', 'requires_info'].includes(currentStatus),
      },
    ];
    return steps;
  };

  return (
    <div className="max-w-2xl mx-auto py-4">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/report-ncii" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to intake form
        </Link>
        <span className="text-xs text-muted-foreground font-mono">Take It Down Act Portal</span>
      </div>

      {!statusInfo ? (
        <Card className="shadow-xl bg-card/60 backdrop-blur-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
              <Search className="h-6 w-6 text-primary" /> Track Report Status
            </CardTitle>
            <CardDescription>
              Verify the processing state and active resolution of your filed NCII intake reports using your private tracking key.
            </CardDescription>
          </CardHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="tracking"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Private Tracking Number</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. TRK-123456-ABCD" className="font-mono text-base tracking-wide" {...field} />
                      </FormControl>
                      <FormDescription>The 16-character alphanumeric key supplied upon submission.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Requester Email Address</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="john@example.com" {...field} />
                      </FormControl>
                      <FormDescription>Must match the email address originally provided during intake.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter className="pt-2">
                <Button type="submit" disabled={isLoading} className="w-full bg-primary hover:bg-primary/90 text-base py-3">
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying Security credentials...
                    </>
                  ) : (
                    'Verify Status'
                  )}
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
      ) : (
        <Card className="shadow-2xl border bg-card/85 backdrop-blur-md overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-indigo-500 to-emerald-500" />
          <CardHeader className="border-b pb-4 px-6 md:px-8 pt-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Report Status Card</span>
                <CardTitle className="text-xl font-bold font-mono tracking-wide text-foreground">
                  {statusInfo.trackingNumber}
                </CardTitle>
              </div>
              <div>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${getStatusConfig(statusInfo.status).colorClass}`}>
                  {getStatusConfig(statusInfo.status).icon}
                  {getStatusConfig(statusInfo.status).label}
                </span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 pt-6 px-6 md:px-8">
            {/* Detailed Description of Current State */}
            <div className="p-4 rounded-xl border bg-muted/40 text-sm leading-relaxed text-muted-foreground">
              {getStatusConfig(statusInfo.status).desc}
            </div>

            {/* Timeline progression */}
            <div className="space-y-4">
              <h4 className="text-xs uppercase font-mono tracking-wider font-semibold text-foreground">Intake Timeline</h4>
              
              <div className="relative pl-6 space-y-6 border-l border-border ml-3">
                {getTimelineSteps(statusInfo.status).map((step, idx) => (
                  <div key={step.id} className="relative">
                    <span className={`absolute -left-[31px] top-0.5 rounded-full w-5.5 h-5.5 border flex items-center justify-center text-xs ${
                      step.done 
                        ? 'bg-emerald-500 border-emerald-500 text-white' 
                        : step.active 
                        ? 'bg-background border-indigo-500 text-indigo-500 shadow-md shadow-indigo-500/25 ring-2 ring-indigo-500/20' 
                        : 'bg-background border-border text-muted-foreground'
                    }`}>
                      {step.done ? '✓' : idx + 1}
                    </span>
                    <div className="pl-3">
                      <h5 className={`text-sm font-semibold ${step.done || step.active ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {step.label}
                      </h5>
                      {idx === 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Received on {new Date(statusInfo.createdAt).toLocaleString()}
                        </p>
                      )}
                      {idx === 1 && statusInfo.reviewedAt && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Reviewed on {new Date(statusInfo.reviewedAt).toLocaleString()}
                        </p>
                      )}
                      {idx === 2 && statusInfo.actionTaken && (
                        <div className="mt-1.5 text-xs text-foreground p-3 rounded-lg border bg-card/65 font-mono">
                          {getActionTakenLabel(statusInfo.actionTaken)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* SLA countdown info */}
            {statusInfo.status !== 'removed' && statusInfo.status !== 'rejected' && (
              <div className="bg-red-500/5 dark:bg-red-950/10 border border-red-500/20 rounded-xl p-4 flex gap-3 text-sm text-red-600 dark:text-red-400">
                <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-semibold block leading-tight">48-Hour SLA Processing Guarantee</span>
                  <p className="text-xs text-muted-foreground">
                    This report must be resolved on or before: <strong>{new Date(statusInfo.slaDeadline).toLocaleString()}</strong>. Our Trust &amp; Safety operations team has flagged your intake code with urgent priority.
                  </p>
                </div>
              </div>
            )}
          </CardContent>

          <CardFooter className="border-t bg-card/30 px-6 md:px-8 py-5 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStatusInfo(null)} className="text-sm font-semibold hover:bg-transparent px-0 hover:underline">
              Check another report
            </Button>
            <span className="text-xs text-muted-foreground font-mono">Status verified secure</span>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
