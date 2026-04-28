
"use client";

import { useRouter } from 'next/navigation';
import { useTribeIdFromParams } from '@/hooks/use-tribe-id';
import Image from 'next/image';
import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, ListChecks, ShieldAlert, Trash2, CheckCircle, Search, Filter as FilterIcon, X as XIcon, ChevronLeft, ChevronRight, Ban, Loader2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useUser } from '@/hooks/use-user';
import { dismissReport, removePost, getActiveReportsForTribe, escalateReport } from '@/lib/actions/content-actions';
import { checkTribeAccess } from '@/lib/actions/tribe-actions';
import type { TribePost, ReportedPost } from '@/lib/types';
import type { Tribe } from '@/lib/types';
import { AuthGuard } from "@/components/providers/auth-guard";


const ITEMS_PER_PAGE_OPTIONS = [5, 10, 15];
const DEFAULT_ITEMS_PER_PAGE = 5;

type SortableReportKeysTribe = 'reportedAt' | 'postTitle' | 'reporterName';
interface SortOptionTribe {
  value: string;
  label: string;
  key: SortableReportKeysTribe;
  direction: 'ascending' | 'descending';
}

const sortOptionsTribe: SortOptionTribe[] = [
  { value: 'reportedAt_desc', label: 'Newest Reports', key: 'reportedAt', direction: 'descending' },
  { value: 'reportedAt_asc', label: 'Oldest Reports', key: 'reportedAt', direction: 'ascending' },
  { value: 'postTitle_asc', label: 'Post Title (A-Z)', key: 'postTitle', direction: 'ascending' },
  { value: 'postTitle_desc', label: 'Post Title (Z-A)', key: 'postTitle', direction: 'descending' },
  { value: 'reporterName_asc', label: 'Reporter (A-Z)', key: 'reporterName', direction: 'ascending' },
  { value: 'reporterName_desc', label: 'Reporter (Z-A)', key: 'reporterName', direction: 'descending' },
];


export default function TribeModQueuePage() {
  return (
    <AuthGuard message="Sign in to moderate tribe reports.">
      <TribeModQueueContent />
    </AuthGuard>
  );
}

function TribeModQueueContent() {
  const router = useRouter();
  const { toast } = useToast();
  const { role } = useUser();
  const { tribeId } = useTribeIdFromParams();
  const [hasAccess, setHasAccess] = useState<boolean | undefined>(undefined);

  const [tribe, setTribe] = useState<Tribe | null>(null);
  const [allReportsForTribe, setAllReportsForTribe] = useState<ReportedPost[]>([]);
  const [postsForThisTribe, setPostsForThisTribe] = useState<TribePost[]>([]);
  const [preventRepostState, setPreventRepostState] = useState<{ [postId: string]: boolean }>({});


  const [searchTerm, setSearchTerm] = useState("");
  const [currentSortValue, setCurrentSortValue] = useState<string>(sortOptionsTribe[0].value);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_ITEMS_PER_PAGE);
  const [isLoading, setIsLoading] = useState(true);
  const [isTakingAction, setIsTakingAction] = useState<string | null>(null);


  const reloadData = async () => {
    if (tribeId) {
        setIsLoading(true);
        const { tribe, reports, posts } = await getActiveReportsForTribe(tribeId);
        setTribe(tribe);
        setAllReportsForTribe(reports);
        setPostsForThisTribe(posts);
        setIsLoading(false);
    }
  };

  useEffect(() => {
    const resolveAccess = async () => {
      const accessLevel = await checkTribeAccess(tribeId);
      // Speakers and above can access the mod queue
      const canAccess = accessLevel === 'platform_admin' || accessLevel === 'founder' || accessLevel === 'speaker';
      setHasAccess(canAccess);
    };
    resolveAccess();
  }, [tribeId]);


  useEffect(() => {
    reloadData();
  }, [tribeId]);

   useEffect(() => {
    const handleFocus = () => reloadData();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [tribeId]);

  const getPostById = (postId: string): TribePost | undefined => {
    return postsForThisTribe.find(post => post.id === postId);
  };

  const handleDismissReport = async (postIdToDismiss: string) => {
    setIsTakingAction(postIdToDismiss);
    await dismissReport(postIdToDismiss);
    reloadData();
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
      reason: `Content removed by ${tribe?.name || 'Tribe'} Admin.`,
      preventRepost: shouldPreventRepost,
    });
    
    reloadData();
    setIsTakingAction(null);
    toast({
      title: "Post Marked as Removed",
      description: `Post "${postTitle || postIdToRemove}" has been marked as removed from this tribe. ${shouldPreventRepost ? "Reposting has been prevented." : "It can be reposted by the author."}`,
      variant: "destructive",
    });
    setPreventRepostState(prev => ({ ...prev, [postIdToRemove]: false }));
  };

  const handleEscalateReport = async (postId: string) => {
    setIsTakingAction(postId);
    try {
      await escalateReport(postId);
      toast({
        title: "Report Escalated",
        description: `Report has been escalated to the Global Moderation team.`,
      });
      reloadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to escalate report';
      toast({ variant: 'destructive', title: 'Escalation Failed', description: msg });
    } finally {
      setIsTakingAction(null);
    }
  };

  const filteredReports = useMemo(() => {
    if (!searchTerm) return allReportsForTribe;
    const lowerSearchTerm = searchTerm.toLowerCase();
    return allReportsForTribe.filter(report => {
      const post = getPostById(report.postId);
      return (
        (report.postTitle && report.postTitle.toLowerCase().includes(lowerSearchTerm)) ||
        (post?.title && post.title.toLowerCase().includes(lowerSearchTerm)) ||
        (report.reporterName && report.reporterName.toLowerCase().includes(lowerSearchTerm)) ||
        (report.reason && report.reason.toLowerCase().includes(lowerSearchTerm))
      );
    });
  }, [allReportsForTribe, searchTerm, postsForThisTribe]);

  const sortedAndFilteredReports = useMemo(() => {
    const sortConfig = sortOptionsTribe.find(opt => opt.value === currentSortValue);
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
  }, [filteredReports, currentSortValue, postsForThisTribe]);

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
  
  if (!tribe) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-height,4rem)-2rem)]">
        <p className="text-muted-foreground">Could not find tribe information.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center mt-2">
        <Button variant="outline" size="sm" onClick={() => router.push(`/t/${tribe?.slug || tribeId}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to {tribe.name}
        </Button>
      </div>

      <Card className="shadow-xl">
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1">
                <div className="flex items-center space-x-3">
                    <ListChecks className="h-7 w-7 text-primary" />
                    <div>
                        <CardTitle className="text-xl sm:text-2xl font-semibold tracking-normal">Moderation Queue</CardTitle>
                        <CardDescription>Review reported content for {tribe.name}. ({sortedAndFilteredReports.length} items)</CardDescription>
                    </div>
                </div>
            </div>
             <Popover>
              <PopoverTrigger asChild>
                <Button variant={searchTerm ? "secondary" : "outline"} size="sm">
                  <FilterIcon className="mr-2 h-4 w-4" /> Filter & View
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 space-y-4 p-4">
                <div className="space-y-2">
                  <Label htmlFor="report-search-input-tribe">Search Reports</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        id="report-search-input-tribe"
                        type="search"
                        placeholder="Search by title, reporter, reason..."
                        value={searchTerm}
                        onChange={handleSearchChange}
                        className="pl-8 w-full"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sort-select-tribe">Sort By</Label>
                  <Select value={currentSortValue} onValueChange={handleSortChange}>
                    <SelectTrigger id="sort-select-tribe" className="w-full">
                      <SelectValue placeholder="Select sort order" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortOptionsTribe.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="items-per-page-select-tribe">Items per Page</Label>
                  <Select value={String(itemsPerPage)} onValueChange={handleItemsPerPageChange}>
                    <SelectTrigger id="items-per-page-select-tribe" className="w-full">
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
                {searchTerm ? "Try a different search term." : `There are no active reported items for ${tribe.name}.`}
              </p>
            </div>
          ) : (
            <Accordion type="multiple" className="w-full space-y-3">
              {paginatedReports.map((report) => {
                const post = getPostById(report.postId);
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
                                    <img src={post.imageUrl} alt={post.imageAlt || "Post image"} className="w-full h-full object-cover" data-ai-hint={post.dataAiHintImage || "post image"}/>
                                    </div>
                                )}
                                {post.isRemoved && (
                                    <div className="mt-2 p-2 bg-destructive/10 border border-destructive/30 rounded-md">
                                        <p className="text-xs font-semibold text-destructive">This post has been marked as removed.</p>
                                        {post.removalReason && <p className="text-xs text-destructive/80 italic mt-0.5">Reason: {post.removalReason}</p>}
                                        {!post.canBeReposted && <p className="text-xs text-destructive font-medium mt-1">Future reposting of this content has been prevented.</p>}
                                    </div>
                                )}
                            </div>
                          </div>

                          {!post?.isRemoved && (
                             <div className="flex items-center space-x-3 pt-3 border-t mt-3">
                                <Checkbox
                                id={`prevent-repost-tribe-${post.id}`}
                                checked={preventRepostState[post.id] || false}
                                onCheckedChange={(checked) => {
                                    setPreventRepostState(prev => ({ ...prev, [post.id]: !!checked }));
                                }}
                                />
                                <Label htmlFor={`prevent-repost-tribe-${post.id}`} className="text-sm font-medium text-foreground flex items-center">
                                  <Ban className="mr-2 h-4 w-4 text-destructive"/> Prevent future reposts of this content
                                </Label>
                            </div>
                          )}

                          <div className="flex items-center space-x-2 pt-4 border-t mt-4">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="icon" variant="outline" onClick={() => handleDismissReport(report.postId)} disabled={isThisPostBeingActioned}>
                                    <CheckCircle className="h-4 w-4" />
                                    <span className="sr-only">Dismiss Report</span>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Dismiss Report</TooltipContent>
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
                                  <TooltipContent>Mark Post as Removed</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="icon" variant="secondary" onClick={() => handleEscalateReport(report.postId)} disabled={isThisPostBeingActioned}>
                                    <ShieldAlert className="h-4 w-4"/>
                                    <span className="sr-only">Escalate to Global</span>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Escalate to Global</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
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
    </div>
  );
}
