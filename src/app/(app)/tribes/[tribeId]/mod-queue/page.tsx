
"use client";

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ListChecks, ShieldAlert, Inbox, Trash2, Eye, AlertCircle, CheckCircle } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { cn } from '@/lib/utils';

import { tribesData, type Tribe } from '../../page'; 
import { 
    initialSampleTribePosts, 
    type TribePost, 
    mockReportedContentData, 
    type ReportedPost 
} from '../page'; // Import from the main tribe detail page

export default function TribeModQueuePage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const tribeId = params.tribeId as string;

  const [tribe, setTribe] = useState<Tribe | null>(null);
  const [reportsForThisTribe, setReportsForThisTribe] = useState<ReportedPost[]>([]);
  const [postsForThisTribe, setPostsForThisTribe] = useState<TribePost[]>(initialSampleTribePosts); // Keep all posts to allow removal, will filter for display

  useEffect(() => {
    if (tribeId) {
      const currentTribeData = tribesData.find(t => t.id === tribeId);
      setTribe(currentTribeData || null);

      if (currentTribeData) {
        // Filter reports relevant to this tribe
        const tribePostIds = new Set(
            initialSampleTribePosts.filter(p => p.tribeId === currentTribeData.id).map(p => p.id)
        );
        const filteredReports = mockReportedContentData.filter(report => tribePostIds.has(report.postId));
        setReportsForThisTribe(filteredReports);
      }
    }
  }, [tribeId]);
  
  const getPostById = (postId: string): TribePost | undefined => {
    return postsForThisTribe.find(post => post.id === postId);
  };

  const handleDismissReport = (postIdToDismiss: string) => {
    setReportsForThisTribe(prev => prev.filter(report => report.postId !== postIdToDismiss));
    toast({
      title: "Report Dismissed",
      description: `Report for post ID ${postIdToDismiss} has been dismissed. The post remains.`,
    });
  };

  const handleRemovePostAndNotify = (postIdToRemove: string, postTitle?: string) => {
    setReportsForThisTribe(prev => prev.filter(report => report.postId !== postIdToRemove));
    setPostsForThisTribe(prev => prev.filter(post => post.id !== postIdToRemove)); // Simulate post removal
    toast({
      title: "Post Removed (Simulated)",
      description: `Post "${postTitle || postIdToRemove}" has been removed from this tribe. The report is dismissed.`,
      variant: "destructive",
    });
  };
  
  const handleEscalateReport = (postId: string) => {
    toast({
        title: "Report Escalated (Simulated)",
        description: `Report for post ID ${postId} has been escalated to the Global Moderation team.`,
    });
  };


  if (!tribe) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-height,4rem)-2rem)]">
        <p className="text-muted-foreground">Loading tribe information...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center mt-2">
        <Button variant="outline" size="sm" onClick={() => router.push(`/tribes/${tribeId}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to {tribe.name}
        </Button>
      </div>

      <Card className="shadow-xl">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <ListChecks className="h-7 w-7 text-primary" />
            <div>
              <CardTitle className="text-2xl font-semibold tracking-normal">Moderation Queue: {tribe.name}</CardTitle>
              <CardDescription>Review and manage reported content specifically for this tribe.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {reportsForThisTribe.length === 0 ? (
            <div className="text-center py-10">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <p className="text-lg font-semibold text-foreground">All Clear!</p>
              <p className="text-muted-foreground">There are no reported items for {tribe.name}.</p>
            </div>
          ) : (
            <Accordion type="multiple" className="w-full space-y-3">
              {reportsForThisTribe.map((report) => {
                const post = getPostById(report.postId);
                return (
                  <AccordionItem key={report.postId} value={report.postId} className="border rounded-lg overflow-hidden bg-card hover:bg-muted/30 transition-colors">
                    <AccordionTrigger className="p-3 hover:no-underline text-left w-full">
                      <div className="flex-1">
                        <p className="font-semibold text-sm text-primary truncate">
                          {report.postTitle || post?.title || "Untitled Post"}
                        </p>
                         <div className="text-xs text-muted-foreground mt-0.5 space-x-2">
                          <span>Reported by: {report.reporterName}</span>
                        </div>
                        {report.reason && <p className="text-xs text-destructive italic mt-1">Reason: {report.reason}</p>}
                      </div>
                      <Badge variant="outline" className="ml-auto mr-2 whitespace-nowrap text-xs">
                        {format(new Date(report.reportedAt), "MMM d, h:mm a")}
                      </Badge>
                    </AccordionTrigger>
                    <AccordionContent className="p-4 border-t bg-background">
                      {post ? (
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-xs uppercase text-muted-foreground mb-1">Reported Post Content:</h4>
                            <div className="p-3 border rounded-md bg-muted/20">
                                <div className="flex items-center space-x-2 mb-2">
                                    <Avatar className="h-8 w-8">
                                        {post.authorAvatar && <AvatarImage src={post.authorAvatar} alt={post.authorName} data-ai-hint={post.dataAiHintAvatar || "avatar"} />}
                                        <AvatarFallback>{post.authorAvatarFallback}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <p className="text-xs font-semibold">{post.authorName}</p>
                                        <p className="text-xs text-muted-foreground">{format(new Date(post.timestamp), "MMM d, yyyy 'at' h:mm a")}</p>
                                    </div>
                                </div>
                                {post.title && <h5 className="font-semibold text-sm mb-1">{post.title}</h5>}
                                <p className="text-xs whitespace-pre-wrap">{post.content}</p>
                                {post.imageUrl && (
                                    <div className="mt-2 relative aspect-video max-w-xs rounded-md overflow-hidden border">
                                    <Image src={post.imageUrl} alt={post.imageAlt || "Post image"} fill style={{objectFit:"cover"}} data-ai-hint={post.dataAiHintImage || "post image"}/>
                                    </div>
                                )}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 pt-2">
                            <Button size="sm" variant="outline" onClick={() => handleDismissReport(report.postId)}>
                              Dismiss Report
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleRemovePostAndNotify(report.postId, report.postTitle || post.title)}>
                              <Trash2 className="mr-1.5 h-3.5 w-3.5"/> Remove Post & Notify
                            </Button>
                             <Button size="sm" variant="secondary" onClick={() => handleEscalateReport(report.postId)}>
                                <AlertCircle className="mr-1.5 h-3.5 w-3.5"/> Escalate to Global
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-destructive">Original post content not found. It may have been deleted or the data is out of sync.</p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
