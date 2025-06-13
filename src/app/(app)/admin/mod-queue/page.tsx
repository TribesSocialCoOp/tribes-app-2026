
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { format } from 'date-fns';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ShieldAlert, Inbox, Trash2, Eye, Users as TribeIcon, AlertCircle, CheckCircle, Hammer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from '@/lib/utils';

import { initialSampleTribePosts, type TribePost, mockReportedContentData, type ReportedPost } from '../../tribes/[tribeId]/page';
import { tribesData, type Tribe } from '../../tribes/page';


export default function ModQueuePage() {
  const router = useRouter();
  const { toast } = useToast();

  const [reports, setReports] = useState<ReportedPost[]>(mockReportedContentData);
  const [allPosts, setAllPosts] = useState<TribePost[]>(initialSampleTribePosts); 
  const [allTribes, setAllTribes] = useState<Tribe[]>(tribesData); 

  const [isBanDialogOpen, setIsBanDialogOpen] = useState(false);
  const [userToBanDetails, setUserToBanDetails] = useState<{ userId: string; userName: string; postId: string } | null>(null);
  const [banDuration, setBanDuration] = useState("permanent");
  const [banReason, setBanReason] = useState("");


  const getPostById = (postId: string): TribePost | undefined => {
    return allPosts.find(post => post.id === postId);
  };

  const getTribeById = (tribeId: string): Tribe | undefined => {
    return allTribes.find(tribe => tribe.id === tribeId);
  };

  const handleDismissReport = (postIdToDismiss: string) => {
    setReports(prev => prev.filter(report => report.postId !== postIdToDismiss));
    toast({
      title: "Report Dismissed",
      description: `Report for post ID ${postIdToDismiss} has been dismissed. The post remains.`,
    });
  };

  const handleRemovePostAndNotify = (postIdToRemove: string, postTitle?: string) => {
    setReports(prev => prev.filter(report => report.postId !== postIdToRemove));
    setAllPosts(prevPosts => prevPosts.filter(post => post.id !== postIdToRemove));
    toast({
      title: "Post Removal Actioned (Simulated)",
      description: `Post "${postTitle || postIdToRemove}" has been flagged for removal from its tribe and the system. The report is dismissed.`,
      variant: "destructive",
    });
  };

  const handleViewTribe = (tribeId: string) => {
    router.push(`/tribes/${tribeId}`);
  };
  
  const handleEscalate = (reportPostId: string) => { 
      toast({
        title: "Report Escalated (Simulated)",
        description: `Report for post ID ${reportPostId} has been escalated to platform administrators.`,
      });
  };

  const handleOpenBanDialog = (post: TribePost) => {
    if (!post || !post.authorId || !post.authorName) {
        toast({ variant: "destructive", title: "Error", description: "Cannot ban author: missing author details."});
        return;
    }
    setUserToBanDetails({ userId: post.authorId, userName: post.authorName, postId: post.id });
    setIsBanDialogOpen(true);
  };

  const handleConfirmBan = () => {
    if (!userToBanDetails) return;

    console.log("Banning user:", {
        userId: userToBanDetails.userId,
        userName: userToBanDetails.userName,
        postId: userToBanDetails.postId,
        duration: banDuration,
        reason: banReason,
    });

    let durationText = "permanently";
    if (banDuration === "1_day") durationText = "for 1 day";
    else if (banDuration === "7_days") durationText = "for 7 days";
    else if (banDuration === "30_days") durationText = "for 30 days";
    
    toast({
      title: "User Banned (Simulated)",
      description: `User ${userToBanDetails.userName} has been banned ${durationText}. Their reputation has been impacted (Simulated). ${banReason ? `Reason: ${banReason}` : ''}`,
      variant: "destructive",
    });

    setIsBanDialogOpen(false);
    setUserToBanDetails(null);
    setBanDuration("permanent");
    setBanReason("");
  };


  if (!reports || !allPosts || !allTribes) {
      return (
        <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-height,4rem)-2rem)]">
            <p className="text-muted-foreground">Loading moderation data...</p>
        </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <header className="mb-6">
        <div className="flex items-center space-x-3">
          <ShieldAlert className="h-10 w-10 text-primary" />
          <h1 className="text-3xl sm:text-4xl font-bold tracking-normal text-foreground font-mono">Global Moderation Queue</h1>
        </div>
        <p className="text-md sm:text-lg text-muted-foreground mt-2">
          Review and manage reported content from across all tribes. Admins see all; tribe owners/moderators see content for their tribes only.
        </p>
      </header>

      <Card className="shadow-xl">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Inbox className="h-6 w-6 text-muted-foreground" />
            <CardTitle className="text-xl tracking-normal">Reported Items ({reports.length})</CardTitle>
          </div>
           <CardDescription>
            Expand items to view post details and take action.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <div className="text-center py-10">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <p className="text-lg font-semibold text-foreground">All Clear!</p>
              <p className="text-muted-foreground">There are no reported items in the queue.</p>
            </div>
          ) : (
            <Accordion type="multiple" className="w-full space-y-3">
              {reports.map((report) => {
                const post = getPostById(report.postId);
                const tribe = post ? getTribeById(post.tribeId) : undefined;

                return (
                  <AccordionItem key={report.postId} value={report.postId} className="border rounded-lg overflow-hidden bg-card hover:bg-muted/30 transition-colors">
                    <AccordionTrigger className="p-3 hover:no-underline text-left w-full">
                      <div className="flex-1">
                        <p className="font-semibold text-sm text-primary truncate">
                          {report.postTitle || post?.title || "Untitled Post"}
                        </p>
                        <div className="text-xs text-muted-foreground mt-0.5 space-x-2">
                          <span>Reported by: {report.reporterName}</span>
                          {tribe && <span>from Tribe: <span className="font-medium">{tribe.name}</span></span>}
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
                             <Button size="sm" variant="destructive" className="bg-red-700 hover:bg-red-800" onClick={() => handleOpenBanDialog(post)}>
                                <Hammer className="mr-1.5 h-3.5 w-3.5"/> Ban Author
                            </Button>
                            {tribe && (
                              <Button size="sm" variant="secondary" onClick={() => handleViewTribe(post.tribeId)}>
                                <TribeIcon className="mr-1.5 h-3.5 w-3.5"/> View Tribe
                              </Button>
                            )}
                             <Button size="sm" variant="outline" onClick={() => handleEscalate(report.postId)}>
                                <AlertCircle className="mr-1.5 h-3.5 w-3.5"/> Escalate
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-destructive">Original post content not found. It may have been deleted.</p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {userToBanDetails && (
        <Dialog open={isBanDialogOpen} onOpenChange={setIsBanDialogOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Ban User: {userToBanDetails.userName}</DialogTitle>
                    <DialogDescription>
                        Select the duration and provide a reason for banning this user. This action may impact their reputation score.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div>
                        <Label className="text-sm font-medium">Ban Duration</Label>
                        <RadioGroup value={banDuration} onValueChange={setBanDuration} className="mt-2 space-y-1">
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="1_day" id="ban-1day" />
                                <Label htmlFor="ban-1day" className="font-normal">1 Day</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="7_days" id="ban-7days" />
                                <Label htmlFor="ban-7days" className="font-normal">7 Days</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="30_days" id="ban-30days" />
                                <Label htmlFor="ban-30days" className="font-normal">30 Days</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="permanent" id="ban-permanent" />
                                <Label htmlFor="ban-permanent" className="font-normal">Permanent</Label>
                            </div>
                        </RadioGroup>
                    </div>
                    <div>
                        <Label htmlFor="ban-reason" className="text-sm font-medium">Reason for Ban (Optional)</Label>
                        <Textarea
                            id="ban-reason"
                            value={banReason}
                            onChange={(e) => setBanReason(e.target.value)}
                            placeholder="Provide context for the ban..."
                            className="mt-1 min-h-[80px]"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button type="button" variant="destructive" onClick={handleConfirmBan}>Confirm Ban</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

    