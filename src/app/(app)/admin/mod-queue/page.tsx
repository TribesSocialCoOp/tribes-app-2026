
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ShieldAlert, Inbox, Trash2, Users as UsersIcon, AlertCircle, CheckCircle, Hammer, Search, Filter as FilterIcon, X as XIcon, ChevronLeft, ChevronRight, Ban, Eye, ArrowLeft, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useUser } from '@/hooks/use-user';
import { dismissReport, removePost, getActiveGlobalReports, banUser, escalateReport } from '@/lib/actions/content-actions';
import { getTribeById } from '@/lib/actions/tribe-actions';
import type { TribePost, ReportedPost } from '@/lib/types';
import type { Tribe } from '@/lib/types';


const ITEMS_PER_PAGE_OPTIONS = [5, 10, 15, 20];
const DEFAULT_ITEMS_PER_PAGE = 10;

type SortableReportKeys = 'reportedAt' | 'postTitle' | 'reporterName' | 'tribeName';
interface SortOption {
  value: string;
  label: string;
  key: SortableReportKeys;
  direction: 'ascending' | 'descending';
}

const sortOptions: SortOption[] = [
  { value: 'reportedAt_desc', label: 'Newest Reports', key: 'reportedAt', direction: 'descending' },
  { value: 'reportedAt_asc', label: 'Oldest Reports', key: 'reportedAt', direction: 'ascending' },
  { value: 'postTitle_asc', label: 'Post Title (A-Z)', key: 'postTitle', direction: 'ascending' },
  { value: 'postTitle_desc', label: 'Post Title (Z-A)', key: 'postTitle', direction: 'descending' },
  { value: 'reporterName_asc', label: 'Reporter (A-Z)', key: 'reporterName', direction: 'ascending' },
  { value: 'reporterName_desc', label: 'Reporter (Z-A)', key: 'reporterName', direction: 'descending' },
];


import { AuthGuard } from '@/components/providers/auth-guard';

export default function ModQueuePage() {
  return (
    <AuthGuard requiredRole="Admin" message="This page is for platform administrators only.">
      <ModQueueContent />
    </AuthGuard>
  );
}

function ModQueueContent() {
  const router = useRouter();
  const { toast } = useToast();
  const { role } = useUser();

  const [reports, setReports] = useState<ReportedPost[]>([]);
  const [allPosts, setAllPosts] = useState<TribePost[]>([]); 
  const [allTribes, setAllTribes] = useState<Tribe[]>([]);

  const [isBanDialogOpen, setIsBanDialogOpen] = useState(false);
  const [userToBanDetails, setUserToBanDetails] = useState<{ userId: string; userName: string; postId: string } | null>(null);
  const [banDuration, setBanDuration] = useState("permanent");
  const [banReason, setBanReason] = useState("");
  const [forceLogout, setForceLogout] = useState(false);
  const [preventRepostState, setPreventRepostState] = useState<{ [postId: string]: boolean }>({});

  const [searchTerm, setSearchTerm] = useState("");
  const [currentSortValue, setCurrentSortValue] = useState<string>(sortOptions[0].value);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_ITEMS_PER_PAGE);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | undefined>(undefined);
  const [isTakingAction, setIsTakingAction] = useState<string | null>(null);


  const reloadData = async () => {
    setIsLoading(true);
    const { reports, posts, tribes } = await getActiveGlobalReports();
    setReports(reports);
    setAllPosts(posts);
    setAllTribes(tribes);
    setIsLoading(false);
  };

  useEffect(() => {
    const canAccess = role === 'Admin';
    setHasAccess(canAccess);
  }, [role]);

  useEffect(() => {
    reloadData(); // Initial load

    const handleFocus = () => reloadData(); // Reload data on window focus
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);


  const getPostById = (postId: string): TribePost | undefined => {
    return allPosts.find(post => post.id === postId);
  };

  const getTribeById = (tribeId: string): Tribe | undefined => {
    return allTribes.find(tribe => tribe.id === tribeId);
  };

  const handleDismissReport = async (postIdToDismiss: string) => {
    setIsTakingAction(postIdToDismiss);
    await dismissReport(postIdToDismiss);
    await reloadData();
    setIsTakingAction(null);
    toast({
      title: "Report Dismissed",
      description: `Report for post ID ${postIdToDismiss} has been dismissed. The post remains.`,
    });
  };

  const handleRemovePostAndNotify = async (postIdToRemove: string, postTitle?: string) => {
    setIsTakingAction(postIdToRemove);
    const shouldPreventRepost = preventRepostState[postIdToRemove] || false;
    
    await removePost({
        postId: postIdToRemove,
        reason: "Content removed by Global Admin.",
        preventRepost: shouldPreventRepost,
    });

    await reloadData();
    setIsTakingAction(null);
    
    toast({
      title: "Post Marked as Removed",
      description: `Post "${postTitle || postIdToRemove}" has been marked as removed. ${shouldPreventRepost ? "Reposting has been prevented." : "It can be reposted by the author."}`,
      variant: "destructive",
    });
    setPreventRepostState(prev => ({ ...prev, [postIdToRemove]: false }));
  };

  const handleViewTribe = (tribeId: string) => {
    const reportWithTribe = reports.find(r => {
        const post = getPostById(r.postId);
        return post?.tribeId === tribeId;
    });

    if (reportWithTribe) {
        const post = getPostById(reportWithTribe.postId);
        if (post) {
            router.push(`/tribes/${post.tribeId}`);
            return;
        }
    }
    const anyPostInTribe = allPosts.find(p => p.tribeId === tribeId);
    if (anyPostInTribe) {
        router.push(`/tribes/${anyPostInTribe.tribeId}`);
    } else {
        toast({title: "Error", description: "Could not find the specified tribe or it has no content.", variant: "destructive"});
    }
  };


  const handleEscalate = async (reportPostId: string) => {
    setIsTakingAction(reportPostId);
    try {
      await escalateReport(reportPostId);
      toast({
        title: "Report Escalated",
        description: `Report for post has been escalated for further review.`,
      });
      reloadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to escalate report';
      toast({ variant: 'destructive', title: 'Escalation Failed', description: msg });
    } finally {
      setIsTakingAction(null);
    }
  };

  const handleOpenBanDialog = (post: TribePost) => {
    if (!post || !post.authorId || !post.authorName) {
      toast({ variant: "destructive", title: "Error", description: "Cannot ban author: missing author details." });
      return;
    }
    setUserToBanDetails({ userId: post.authorId, userName: post.authorName, postId: post.id });
    setIsBanDialogOpen(true);
  };

  const handleConfirmBan = async () => {
    if (!userToBanDetails) return;
    setIsTakingAction(userToBanDetails.postId);
    try {
      await banUser({
        userId: userToBanDetails.userId,
        reason: banReason || undefined,
        duration: banDuration as '1_day' | '7_days' | '30_days' | 'permanent',
        relatedPostId: userToBanDetails.postId,
        forceLogout,
      });
      let durationText = "permanently";
      if (banDuration === "1_day") durationText = "for 1 day";
      else if (banDuration === "7_days") durationText = "for 7 days";
      else if (banDuration === "30_days") durationText = "for 30 days";
      toast({
        title: "User Banned",
        description: `User ${userToBanDetails.userName} has been banned ${durationText}.${forceLogout ? ' All sessions invalidated.' : ''} ${banReason ? `Reason: ${banReason}` : ''}`,
        variant: "destructive",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to ban user';
      toast({ variant: 'destructive', title: 'Ban Failed', description: msg });
    } finally {
      setIsTakingAction(null);
      setIsBanDialogOpen(false);
      setUserToBanDetails(null);
      setBanDuration("permanent");
      setBanReason("");
      setForceLogout(false);
    }
  };

  const filteredReports = useMemo(() => {
    if (!searchTerm && reports.length > 0) return reports; // Ensure reports is not empty before returning
    if (reports.length === 0 && !searchTerm) return []; // if reports is empty and no search term, return empty

    const lowerSearchTerm = searchTerm.toLowerCase();
    return reports.filter(report => {
      const post = getPostById(report.postId);
      const tribe = (post?.tribeId) ? getTribeById(post.tribeId) : undefined;
      return (
        (report.postTitle && report.postTitle.toLowerCase().includes(lowerSearchTerm)) ||
        (post?.title && post.title.toLowerCase().includes(lowerSearchTerm)) ||
        (report.reporterName && report.reporterName.toLowerCase().includes(lowerSearchTerm)) ||
        (report.reason && report.reason.toLowerCase().includes(lowerSearchTerm)) ||
        (tribe?.name && tribe.name.toLowerCase().includes(lowerSearchTerm))
      );
    });
  }, [reports, searchTerm, allPosts, allTribes]); 

  const sortedAndFilteredReports = useMemo(() => {
    const sortConfig = sortOptions.find(opt => opt.value === currentSortValue);
    if (!sortConfig) return filteredReports;

    return [...filteredReports].sort((a, b) => {
      let aValue, bValue;

      if (sortConfig.key === 'reportedAt') {
        aValue = new Date(a.reportedAt).getTime();
        bValue = new Date(b.reportedAt).getTime();
      } else if (sortConfig.key === 'postTitle') {
        aValue = a.postTitle?.toLowerCase() || getPostById(a.postId)?.title?.toLowerCase() || '';
        bValue = b.postTitle?.toLowerCase() || getPostById(b.postId)?.title?.toLowerCase() || '';
      } else if (sortConfig.key === 'reporterName') {
        aValue = a.reporterName?.toLowerCase() || '';
        bValue = b.reporterName?.toLowerCase() || '';
      } else if (sortConfig.key === 'tribeName') {
        const tribeA = getPostById(a.postId)?.tribeId ? getTribeById(getPostById(a.postId)!.tribeId!) : undefined;
        const tribeB = getPostById(b.postId)?.tribeId ? getTribeById(getPostById(b.postId)!.tribeId!) : undefined;
        aValue = tribeA?.name.toLowerCase() || '';
        bValue = tribeB?.name.toLowerCase() || '';
      } else {
         aValue = (a as unknown as Record<string, unknown>)[sortConfig.key];
         bValue = (b as unknown as Record<string, unknown>)[sortConfig.key];
      }
      
      if (aValue === undefined || aValue === null) return 1;
      if (bValue === undefined || bValue === null) return -1;

      let comparison = 0;
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = aValue.localeCompare(bValue);
      } else if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue - bValue;
      }
      return sortConfig.direction === 'ascending' ? comparison : comparison * -1;
    });
  }, [filteredReports, currentSortValue]); 

  const totalPages = Math.ceil(sortedAndFilteredReports.length / itemsPerPage);
  const paginatedReports = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedAndFilteredReports.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedAndFilteredReports, currentPage, itemsPerPage]);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    setCurrentPage(1);
  };
  
  const handleClearSearch = () => {
    setSearchTerm("");
    setCurrentPage(1);
  };

  const handleSortChange = (value: string) => {
    setCurrentSortValue(value);
    setCurrentPage(1);
  };

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };
  
  const handleNextPage = () => setCurrentPage(prev => Math.min(prev + 1, totalPages));
  const handlePreviousPage = () => setCurrentPage(prev => Math.max(prev - 1, 1));

  const availableSortOptions = useMemo(() => {
    const options = [...sortOptions];
    if (allTribes.length > 0) {
      options.push(
        { value: 'tribeName_asc', label: 'Tribe Name (A-Z)', key: 'tribeName', direction: 'ascending' },
        { value: 'tribeName_desc', label: 'Tribe Name (Z-A)', key: 'tribeName', direction: 'descending' }
      );
    }
    return options;
  }, [allTribes]);

  if (hasAccess === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-height,4rem)-2rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <Card className="max-w-xl mx-auto mt-8 shadow-lg">
        <CardHeader className="text-center">
            <ShieldAlert className="h-16 w-16 text-destructive mx-auto mb-4"/>
            <CardTitle className="text-2xl font-bold">Access Denied</CardTitle>
            <CardDescription>You do not have the required permissions to view this page.</CardDescription>
        </CardHeader>
        <CardFooter className="flex justify-center">
            <Button onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
            </Button>
        </CardFooter>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-height,4rem)-2rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
          Review and manage reported content from across all tribes. Admins see all; tribe owners/moderators see content for their tribes only. Reports for already removed posts are hidden.
        </p>
      </header>

      <Card className="shadow-xl">
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-2">
              <Inbox className="h-6 w-6 text-muted-foreground" />
              <CardTitle className="text-xl tracking-normal">Reported Items ({sortedAndFilteredReports.length})</CardTitle>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant={searchTerm ? "secondary" : "outline"}>
                  <FilterIcon className="mr-2 h-4 w-4" /> Filter & View Options
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 space-y-4 p-4">
                <div className="space-y-2">
                  <Label htmlFor="report-search-input">Search Reports</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        id="report-search-input"
                        type="search"
                        placeholder="Search by title, reporter, reason..."
                        value={searchTerm}
                        onChange={handleSearchChange}
                        className="pl-8 w-full"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sort-select">Sort By</Label>
                  <Select value={currentSortValue} onValueChange={handleSortChange}>
                    <SelectTrigger id="sort-select" className="w-full">
                      <SelectValue placeholder="Select sort order" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSortOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="items-per-page-select">Items per Page</Label>
                  <Select value={String(itemsPerPage)} onValueChange={handleItemsPerPageChange}>
                    <SelectTrigger id="items-per-page-select" className="w-full">
                      <SelectValue placeholder="Select items per page" />
                    </SelectTrigger>
                    <SelectContent>
                      {ITEMS_PER_PAGE_OPTIONS.map(num => (
                        <SelectItem key={num} value={String(num)}>{num}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </PopoverContent>
            </Popover>
          </div>
           <CardDescription className="pt-2">
            Expand items to view post details and take action. Reports for already removed posts are hidden.
          </CardDescription>
        </CardHeader>
        {searchTerm && (
          <div className="px-6 pt-0 pb-4">
            <Badge variant="secondary" className="flex items-center justify-between max-w-max">
              Search: "{searchTerm}"
              <Button variant="ghost" size="icon" className="ml-1 h-5 w-5 hover:bg-transparent" onClick={handleClearSearch}>
                <XIcon className="h-3 w-3" />
              </Button>
            </Badge>
          </div>
        )}
        <CardContent className={cn(searchTerm && "pt-0")}>
          {paginatedReports.length === 0 ? (
            <div className="text-center py-10">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <p className="text-lg font-semibold text-foreground">
                {searchTerm ? "No reports match your search." : "All Clear!"}
              </p>
              <p className="text-muted-foreground">
                {searchTerm ? "Try a different search term or clear the filter." : "There are no active reported items in the queue."}
              </p>
            </div>
          ) : (
            <Accordion type="multiple" className="w-full space-y-3">
              {paginatedReports.map((report) => {
                const post = getPostById(report.postId);
                const tribe = (post?.tribeId) ? getTribeById(post.tribeId) : undefined;
                const isThisPostBeingActioned = isTakingAction === report.postId;

                return (
                  <AccordionItem key={report.postId} value={report.postId} className={cn("border rounded-lg overflow-hidden bg-card hover:bg-muted/30 transition-colors", post?.isRemoved && "opacity-70 bg-destructive/5", isThisPostBeingActioned && "opacity-50 pointer-events-none")}>
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
                      {isThisPostBeingActioned && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                    </AccordionTrigger>
                    <AccordionContent className="p-4 border-t bg-background">
                      {post ? (
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-xs uppercase text-muted-foreground mb-1">Reported Post Content:</h4>
                            <div className={cn("p-3 border rounded-md bg-muted/20", post.isRemoved && "border-destructive/30")}>
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
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={post.imageUrl} alt={post.imageAlt || "Post image"} className="w-full h-full object-cover" data-ai-hint={post.dataAiHintImage || "post image"} />
                                </div>
                              )}
                               {post.isRemoved && ( 
                                <div className="mt-2 p-2 bg-destructive/10 border border-destructive/30 rounded-md">
                                    <p className="text-xs font-semibold text-destructive">This post has been marked as removed by an administrator.</p>
                                    {post.removalReason && <p className="text-xs text-destructive/80 italic mt-0.5">Reason: {post.removalReason}</p>}
                                    {!post.canBeReposted && <p className="text-xs text-destructive font-medium mt-1">Future reposting of this content has been prevented.</p>}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {!post?.isRemoved && (
                            <div className="flex items-center space-x-3 pt-3 border-t mt-3">
                                <Checkbox
                                id={`prevent-repost-${post.id}`}
                                checked={preventRepostState[post.id] || false}
                                onCheckedChange={(checked) => {
                                    setPreventRepostState(prev => ({ ...prev, [post.id]: !!checked }));
                                }}
                                />
                                <Label htmlFor={`prevent-repost-${post.id}`} className="text-sm font-medium text-foreground flex items-center">
                                  <Ban className="mr-2 h-4 w-4 text-destructive"/> Prevent future reposts of this content
                                </Label>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2 pt-4 border-t mt-4">
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button size="icon" variant="outline" onClick={() => handleDismissReport(report.postId)} disabled={isThisPostBeingActioned}>
                                            <CheckCircle className="h-4 w-4" />
                                            <span className="sr-only">Dismiss Report</span>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>Dismiss Report</p></TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            
                            {!post.isRemoved && ( 
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button size="icon" variant="destructive" onClick={() => handleRemovePostAndNotify(report.postId, report.postTitle || post.title)} disabled={isThisPostBeingActioned}>
                                                <Trash2 className="h-4 w-4"/>
                                                <span className="sr-only">Mark Post as Removed</span>
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent><p>Mark Post as Removed</p></TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            )}
                             <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button size="icon" variant="destructive" className="bg-red-700 hover:bg-red-800" onClick={() => handleOpenBanDialog(post)} disabled={isThisPostBeingActioned}>
                                            <Hammer className="h-4 w-4"/>
                                            <span className="sr-only">Ban Author</span>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>Ban Author</p></TooltipContent>
                                </Tooltip>
                            </TooltipProvider>

                            {tribe && (
                               <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button size="icon" variant="secondary" onClick={() => post.tribeId && handleViewTribe(post.tribeId)} disabled={isThisPostBeingActioned || !post.tribeId}>
                                                <Eye className="h-4 w-4"/>
                                                <span className="sr-only">View Tribe</span>
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent><p>View Tribe ({tribe.name})</p></TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            )}
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button size="icon" variant="outline" onClick={() => handleEscalate(report.postId)} disabled={isThisPostBeingActioned}>
                                            <ShieldAlert className="h-4 w-4"/>
                                            <span className="sr-only">Escalate</span>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>Escalate to Platform Admins</p></TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-destructive">Original post content not found. It may have been deleted or data is out of sync.</p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
        {totalPages > 1 && (
          <CardFooter className="border-t pt-4 flex flex-col sm:flex-row items-center justify-between">
            <p className="text-xs text-muted-foreground mb-2 sm:mb-0">
              Showing {paginatedReports.length} of {sortedAndFilteredReports.length} reports.
            </p>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreviousPage}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardFooter>
        )}
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
                  <div className="flex items-center space-x-2"><RadioGroupItem value="1_day" id="ban-1day" /><Label htmlFor="ban-1day" className="font-normal">1 Day</Label></div>
                  <div className="flex items-center space-x-2"><RadioGroupItem value="7_days" id="ban-7days" /><Label htmlFor="ban-7days" className="font-normal">7 Days</Label></div>
                  <div className="flex items-center space-x-2"><RadioGroupItem value="30_days" id="ban-30days" /><Label htmlFor="ban-30days" className="font-normal">30 Days</Label></div>
                  <div className="flex items-center space-x-2"><RadioGroupItem value="permanent" id="ban-permanent" /><Label htmlFor="ban-permanent" className="font-normal">Permanent</Label></div>
                </RadioGroup>
              </div>
              <div>
                <Label htmlFor="ban-reason" className="text-sm font-medium">Reason for Ban (Optional)</Label>
                <Textarea id="ban-reason" value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="Provide context for the ban..." className="mt-1 min-h-[80px]" />
              </div>
              <div className="flex items-center space-x-3 pt-2 border-t">
                <Checkbox
                  id="force-logout-ban"
                  checked={forceLogout}
                  onCheckedChange={(checked) => setForceLogout(!!checked)}
                />
                <Label htmlFor="force-logout-ban" className="text-sm font-medium text-destructive flex items-center">
                  <Ban className="mr-2 h-4 w-4" /> Hard Ban — Invalidate all active sessions
                </Label>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
              <Button type="button" variant="destructive" onClick={handleConfirmBan}>Confirm Ban</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
