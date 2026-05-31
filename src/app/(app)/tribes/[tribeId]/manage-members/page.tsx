
"use client";

import { useRouter } from 'next/navigation';
import { useGoBack } from '@/hooks/use-go-back';
import Link from 'next/link';
import { useTribeIdFromParams } from '@/hooks/use-tribe-id';
import { Button } from '@/components/ui/button';
import { RoleBadge } from '@/components/ui/role-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, UsersRound, Pencil, UserCheck, UserX, Hammer, MoreVertical, ShieldAlert, Check, X, Loader2, ChevronLeft, ChevronRight, CheckCheck, XCircle } from 'lucide-react';
import {
  ResponsiveMenu,
  ResponsiveMenuContent,
  ResponsiveMenuItem,
  ResponsiveMenuSeparator,
  ResponsiveMenuTrigger,
} from "@/components/ui/responsive-menu";
import React, { useEffect, useState, useCallback } from 'react';
import { useToast } from "@/hooks/use-toast";
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/use-user';
import { useActionError } from '@/hooks/use-action-error';
import { Checkbox } from '@/components/ui/checkbox';

import type { TribeMember, PendingMember } from '@/lib/types';
import type { Tribe } from '@/lib/types';
import { getTribeById, getTribeMembers, getTribeMemberCount, getPendingMembers, updateMemberNickname, updateMemberRole, approveJoinRequest, denyJoinRequest, bulkApproveJoinRequests, bulkDenyJoinRequests, checkTribeAccess } from '@/lib/actions/tribe-actions';
import { banMemberFromTribe } from '@/lib/actions/content-actions';


import { AuthGuard } from "@/components/providers/auth-guard";

export default function ManageMembersPage() {
  return (
    <AuthGuard message="Sign in to manage tribe members.">
      <ManageMembersContent />
    </AuthGuard>
  );
}

function ManageMembersContent() {
  const router = useRouter();
  const goBack = useGoBack();
  // Read origin from sessionStorage (set by activity tab) — adblocker-proof alternative to ?from= query params
  // Must use useEffect, not useState initializer — SSR renders client components first, and
  // React hydration preserves the server's initial state (null) without re-running the initializer.
  const [from, setFrom] = useState<string | null>(null);
  useEffect(() => {
    const origin = sessionStorage.getItem('manage-members-origin');
    if (origin) {
      setFrom(origin);
    }
  }, []);
  const { tribeId } = useTribeIdFromParams();
  const { toast } = useToast();
  const { role } = useUser();
  const { handleError } = useActionError();

  const [tribe, setTribe] = useState<Tribe | null>(null);
  const [currentTribeMembers, setCurrentTribeMembers] = useState<TribeMember[]>([]);
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);

  // Bulk selection state
  const [selectedPending, setSelectedPending] = useState<Set<string>>(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [showDeclineAllConfirm, setShowDeclineAllConfirm] = useState(false);

  // Pagination state
  const [membersPage, setMembersPage] = useState(1);
  const [membersTotalCount, setMembersTotalCount] = useState(0);
  const membersLimit = 30;

  const [isNicknameDialogOpen, setIsNicknameDialogOpen] = useState(false);
  const [memberToEditNickname, setMemberToEditNickname] = useState<TribeMember | null>(null);
  const [nicknameInputValue, setNicknameInputValue] = useState("");

  const [isBanDialogOpen, setIsBanDialogOpen] = useState(false);
  const [memberToBanDetails, setMemberToBanDetails] = useState<{ memberId: string; memberName: string; } | null>(null);
  const [banDuration, setBanDuration] = useState("permanent_from_tribe"); 
  const [banReason, setBanReason] = useState("");
  
  const [hasAccess, setHasAccess] = useState<boolean | undefined>(undefined);

  const reloadData = useCallback(async () => {
    if (!tribeId) return { pendingCount: 0 };
    setIsDataLoading(true);
    const [tribeData, membersData, memberCount, pendingData] = await Promise.all([
      getTribeById(tribeId),
      getTribeMembers(tribeId, { page: membersPage, limit: membersLimit }),
      getTribeMemberCount(tribeId),
      getPendingMembers(tribeId)
    ]);
    setTribe(tribeData);
    setCurrentTribeMembers(membersData);
    setMembersTotalCount(memberCount);
    setPendingMembers(pendingData);
    setIsDataLoading(false);
    return { pendingCount: pendingData.length };
  }, [tribeId, membersPage]);

  useEffect(() => {
    if (!tribeId) return;
    let cancelled = false;

    const resolveAccess = async (attempt = 0) => {
      try {
        const accessLevel = await checkTribeAccess(tribeId);

        // If the server returned 'guest' but we KNOW the user is logged in
        // (AuthGuard already verified), the session hasn't hydrated yet.
        // Retry a few times with backoff before giving up.
        if (accessLevel === 'guest' && attempt < 3) {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          if (!cancelled) return resolveAccess(attempt + 1);
          return;
        }

        if (cancelled) return;
        // Speakers and above can access member management
        const canAccess = accessLevel === 'platform_admin' || accessLevel === 'founder' || accessLevel === 'speaker';
        setHasAccess(canAccess);
        if (canAccess) {
          // Load data separately — a data fetch failure must NOT revoke access
          reloadData().catch((dataErr) => {
            handleError(dataErr, 'Failed to load member data');
          });
        }
      } catch (err) {
        if (cancelled) return;
        // Only set hasAccess(false) when the ACCESS CHECK itself fails
        handleError(err, 'Failed to verify permissions');
        setHasAccess(false);
      }
    };
    resolveAccess();
    return () => { cancelled = true; };
  }, [tribeId, reloadData, handleError]);

  const handleOpenNicknameDialog = (member: TribeMember) => {
    setMemberToEditNickname(member);
    setNicknameInputValue(member.tribeAssignedNickname || "");
    setIsNicknameDialogOpen(true);
  };

  const handleSaveNickname = async () => {
    if (!memberToEditNickname) return;
    await updateMemberNickname(tribeId, memberToEditNickname.id, nicknameInputValue.trim() || undefined);
    toast({
      title: "Nickname Updated",
      description: `Nickname for ${memberToEditNickname.name} has been ${nicknameInputValue.trim() ? 'set to "' + nicknameInputValue.trim() + '"' : 'cleared'}.`,
    });
    setIsNicknameDialogOpen(false);
    setMemberToEditNickname(null);
    setNicknameInputValue("");
    reloadData();
  };

  const handleToggleSpeakerRole = async (member: TribeMember) => {
    const newRole = member.role === 'speaker' ? 'member' : 'speaker';
    await updateMemberRole(tribeId, member.id, newRole);
    toast({
      title: `Role Updated for ${member.name}`,
      description: `${member.name} is now a ${newRole}.`,
    });
    reloadData();
  };

  const handleOpenBanDialog = (member: TribeMember) => {
    if (!member || !member.id || !member.name) {
        toast({ variant: "destructive", title: "Error", description: "Cannot ban member: missing member details."});
        return;
    }
    setMemberToBanDetails({ memberId: member.id, memberName: member.name });
    setIsBanDialogOpen(true);
  };

  const handleConfirmBan = async () => {
    if (!memberToBanDetails || !tribe) return;

    await banMemberFromTribe({
      tribeId: tribe.id,
      memberId: memberToBanDetails.memberId,
      reason: banReason,
      duration: banDuration,
    });

    let durationText = "permanently from this tribe";
    if (banDuration === "1_day") durationText = "for 1 day from this tribe";
    else if (banDuration === "7_days") durationText = "for 7 days from this tribe";
    else if (banDuration === "30_days") durationText = "for 30 days from this tribe";
    
    toast({
      title: "Member Banned from Tribe",
      description: `Member ${memberToBanDetails.memberName} has been banned ${durationText}. Their reputation may be impacted.`,
      variant: "destructive",
    });

    setIsBanDialogOpen(false);
    setMemberToBanDetails(null);
    setBanDuration("permanent_from_tribe");
    setBanReason("");
    reloadData();
  };

  const handleApproveRequest = async (pendingMember: PendingMember) => {
    try {
      await approveJoinRequest(tribeId, pendingMember.id);
      toast({
        title: "Member Approved",
        description: `${pendingMember.name} has been added to the tribe.`,
      });
      // Reload all lists (members + pending) in one shot
      const reloadResult = await reloadData();
      // If from activity and no more pending, auto-return
      if (from === 'activity' && reloadResult?.pendingCount === 0) {
        sessionStorage.removeItem('manage-members-origin');
        setTimeout(() => router.replace('/your-comms'), 600);
      }
    } catch (err) {
      handleError(err, 'Failed to approve member');
    }
  };

  const handleDenyRequest = async (pendingMemberId: string, memberName: string) => {
    try {
      await denyJoinRequest(tribeId, pendingMemberId);
      toast({
        title: "Request Denied",
        description: `The request from ${memberName} has been denied.`,
        variant: 'destructive'
      });
      // Reload all lists in one shot
      const reloadResult = await reloadData();
      // If from activity and no more pending, auto-return
      if (from === 'activity' && reloadResult?.pendingCount === 0) {
        sessionStorage.removeItem('manage-members-origin');
        setTimeout(() => router.replace('/your-comms'), 600);
      }
    } catch (err) {
      handleError(err, 'Failed to deny request');
    }
  };

  // ======== BULK ACTIONS ========

  const togglePendingSelection = (id: string) => {
    setSelectedPending(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedPending.size === pendingMembers.length) {
      setSelectedPending(new Set());
    } else {
      setSelectedPending(new Set(pendingMembers.map(m => m.id)));
    }
  };

  const handleBulkApprove = async (ids: string[]) => {
    if (ids.length === 0) return;
    setIsBulkProcessing(true);
    try {
      const result = await bulkApproveJoinRequests(tribeId, ids);
      if (result.failed.length > 0) {
        toast({
          title: `Approved ${result.approved} of ${ids.length}`,
          description: `${result.failed.length} failed: ${result.failed[0]?.reason ?? 'Unknown'}`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: `${result.approved} Member${result.approved !== 1 ? 's' : ''} Approved`,
          description: `Successfully added to ${tribe?.name ?? 'the tribe'}.`,
        });
      }
      setSelectedPending(new Set());
      reloadData();
    } catch (err) {
      handleError(err, 'Bulk approve failed');
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkDeny = async (ids: string[]) => {
    if (ids.length === 0) return;
    setIsBulkProcessing(true);
    try {
      const result = await bulkDenyJoinRequests(tribeId, ids);
      toast({
        title: `${result.denied} Request${result.denied !== 1 ? 's' : ''} Declined`,
        description: 'The pending requests have been removed.',
        variant: 'destructive',
      });
      setSelectedPending(new Set());
      setShowDeclineAllConfirm(false);
      reloadData();
    } catch (err) {
      handleError(err, 'Bulk decline failed');
    } finally {
      setIsBulkProcessing(false);
    }
  };


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
            <Button onClick={goBack}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
            </Button>
        </CardFooter>
      </Card>
    );
  }
  
  if (isDataLoading) {
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
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={goBack}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {from === 'activity' ? 'Back to Activity' : `Back to ${tribe.name}`}
        </Button>
        {from === 'activity' && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => router.push(`/t/${tribe?.slug || tribeId}`)}
            className="text-muted-foreground hover:text-foreground"
          >
            Go to {tribe.name}
          </Button>
        )}
      </div>

      {tribe.joinMechanism === 'approval' && pendingMembers.length > 0 && (
          <Card className="shadow-lg border-amber-500/50">
              <CardHeader>
                  <CardTitle className="text-xl tracking-normal">Pending Join Requests ({pendingMembers.length})</CardTitle>
                  <CardDescription>Approve or deny requests to join {tribe.name}.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                  {/* Bulk action toolbar */}
                  <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-muted/50 border">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="select-all-pending"
                        checked={selectedPending.size === pendingMembers.length && pendingMembers.length > 0}
                        onCheckedChange={toggleSelectAll}
                        disabled={isBulkProcessing}
                      />
                      <label htmlFor="select-all-pending" className="text-sm font-medium cursor-pointer select-none">
                        {selectedPending.size === pendingMembers.length ? 'Deselect All' : 'Select All'}
                      </label>
                    </div>

                    {selectedPending.size > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {selectedPending.size} of {pendingMembers.length} selected
                      </Badge>
                    )}

                    <div className="flex-1" />

                    {selectedPending.size > 0 ? (
                      /* When items are selected: act on selection */
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-600 border-green-300 hover:bg-green-500/10 hover:text-green-600"
                          disabled={isBulkProcessing}
                          onClick={() => handleBulkApprove(Array.from(selectedPending))}
                        >
                          {isBulkProcessing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="mr-1.5 h-3.5 w-3.5" />}
                          Accept Selected
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                          disabled={isBulkProcessing}
                          onClick={() => handleBulkDeny(Array.from(selectedPending))}
                        >
                          {isBulkProcessing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <XCircle className="mr-1.5 h-3.5 w-3.5" />}
                          Decline Selected
                        </Button>
                      </>
                    ) : (
                      /* When nothing selected: act on all */
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-600 border-green-300 hover:bg-green-500/10 hover:text-green-600"
                          disabled={isBulkProcessing}
                          onClick={() => handleBulkApprove(pendingMembers.map(m => m.id))}
                        >
                          {isBulkProcessing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="mr-1.5 h-3.5 w-3.5" />}
                          Accept All
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                          disabled={isBulkProcessing}
                          onClick={() => setShowDeclineAllConfirm(true)}
                        >
                          <XCircle className="mr-1.5 h-3.5 w-3.5" />
                          Decline All
                        </Button>
                      </>
                    )}
                  </div>

                  {/* Pending member rows */}
                  <div className="space-y-2">
                      {pendingMembers.map(member => (
                          <div key={member.id} className={cn(
                            "flex items-center justify-between p-2 border rounded-md transition-colors",
                            selectedPending.has(member.id) && "bg-primary/5 border-primary/30",
                          )}>
                            <div className="flex items-center space-x-3">
                                  <Checkbox
                                    checked={selectedPending.has(member.id)}
                                    onCheckedChange={() => togglePendingSelection(member.id)}
                                    disabled={isBulkProcessing}
                                  />
                                  <Link href={`/u/${member.slug || member.id}`} className="hover:opacity-80 transition-opacity">
                                    <Avatar className="h-9 w-9">
                                        <AvatarImage src={member.avatar} alt={member.name} data-ai-hint={member.dataAiHint} />
                                        <AvatarFallback>{member.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                  </Link>
                                  <div>
                                      <Link href={`/u/${member.slug || member.id}`} className="hover:underline">
                                        <p className="font-semibold text-sm">{member.name}</p>
                                      </Link>
                                      <p className="text-xs text-muted-foreground">Requested {new Date(member.requestTimestamp).toLocaleDateString()}</p>
                                  </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                  <Button size="icon" variant="outline" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDenyRequest(member.id, member.name)} disabled={isBulkProcessing}>
                                      <X className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="outline" className="h-8 w-8 text-green-600 hover:bg-green-500/10 hover:text-green-600" onClick={() => handleApproveRequest(member)} disabled={isBulkProcessing}>
                                      <Check className="h-4 w-4" />
                                  </Button>
                              </div>
                          </div>
                      ))}
                  </div>
              </CardContent>
          </Card>
      )}

      <Card className="shadow-xl">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <UsersRound className="h-7 w-7 text-primary" />
            <div>
              <CardTitle className="text-2xl font-semibold tracking-normal">Manage Members</CardTitle>
              <CardDescription>View, assign nicknames, and manage roles for members of {tribe.name}.</CardDescription>
            </div>
          </div>
          {membersTotalCount > 0 && (
            <p className="text-sm text-muted-foreground">{membersTotalCount} total members</p>
          )}
        </CardHeader>
        <CardContent>
          {currentTribeMembers.length > 0 ? (
            <div className="space-y-3">
              {currentTribeMembers.map(member => (
                <Card key={member.id} className="p-3 flex items-center justify-between hover:bg-muted/30 transition-colors">
                  <div className="flex items-center space-x-3 flex-grow">
                    <Link href={`/u/${member.slug || member.id}`} className="hover:opacity-80 transition-opacity">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={member.avatar} alt={member.name} data-ai-hint={member.dataAiHint} />
                        <AvatarFallback>{member.name.substring(0,2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                    </Link>
                    <div className="flex-grow">
                      <Link href={`/u/${member.slug || member.id}`} className="hover:underline">
                        <p className="font-semibold text-sm">{member.name}</p>
                      </Link>
                      {member.tribeAssignedNickname ? (
                        <p className="text-xs text-primary mt-0.5">Nickname: <span className="italic">{member.tribeAssignedNickname}</span></p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-0.5">No tribe-specific nickname.</p>
                      )}
                      <div className="flex items-center space-x-2 mt-1.5">
                          <RoleBadge role={member.role || 'member'} />
                          {member.reputationStatus && (
                              <Badge className={cn("text-xs border-transparent", {
                                  'bg-accent text-accent-foreground': member.reputationStatus === 'Elder' || member.reputationStatus === 'Veteran',
                                  'bg-primary text-primary-foreground': member.reputationStatus === 'Trusted' || member.reputationStatus === 'Active',
                                  'bg-muted text-muted-foreground': member.reputationStatus === 'Newcomer' || member.reputationStatus === 'Onboarding'
                              })}>
                                  {member.reputationStatus}
                              </Badge>
                          )}
                      </div>
                    </div>
                  </div>
                  <ResponsiveMenu>
                    <ResponsiveMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground shrink-0">
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">Member Actions</span>
                      </Button>
                    </ResponsiveMenuTrigger>
                    <ResponsiveMenuContent align="end">
                      <ResponsiveMenuItem onClick={() => handleOpenNicknameDialog(member)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        {member.tribeAssignedNickname ? "Edit" : "Assign"} Nickname
                      </ResponsiveMenuItem>
                      <ResponsiveMenuItem onClick={() => handleToggleSpeakerRole(member)}>
                        {member.role === 'speaker' ? <UserX className="mr-2 h-4 w-4" /> : <UserCheck className="mr-2 h-4 w-4" />}
                        {member.role === 'speaker' ? 'Demote to Member' : 'Make Speaker'}
                      </ResponsiveMenuItem>
                      <ResponsiveMenuSeparator />
                      <ResponsiveMenuItem 
                        onClick={() => handleOpenBanDialog(member)} 
                        className="text-destructive hover:!bg-destructive/10 hover:!text-destructive focus:!bg-destructive/10 focus:!text-destructive"
                      >
                        <Hammer className="mr-2 h-4 w-4" />
                        Ban Member
                      </ResponsiveMenuItem>
                    </ResponsiveMenuContent>
                  </ResponsiveMenu>
                </Card>
              ))}
            </div>
          ) : (
             <div className="mt-6 p-6 border-2 border-dashed rounded-lg text-center">
                <UsersRound className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50"/>
                <p className="text-sm text-muted-foreground">No members found for this tribe.</p>
            </div>
          )}
        </CardContent>

        {/* Pagination */}
        {(() => {
          const totalPages = Math.ceil(membersTotalCount / membersLimit);
          return totalPages > 1 ? (
            <div className="flex items-center justify-end space-x-2 px-6 py-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMembersPage(p => Math.max(1, p - 1))}
                disabled={membersPage === 1 || isDataLoading}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <div className="text-sm text-muted-foreground px-2">
                Page {membersPage} of {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMembersPage(p => Math.min(totalPages, p + 1))}
                disabled={membersPage === totalPages || isDataLoading}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          ) : null;
        })()}
      </Card>

      {memberToEditNickname && (
        <Dialog open={isNicknameDialogOpen} onOpenChange={setIsNicknameDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Set Nickname for {memberToEditNickname.name}</DialogTitle>
              <DialogDescription>
                This nickname will be specific to the tribe: {tribe.name}.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-2">
              <Label htmlFor="nickname-input">Tribe-Specific Nickname</Label>
              <Input
                id="nickname-input"
                value={nicknameInputValue}
                onChange={(e) => setNicknameInputValue(e.target.value)}
                placeholder="Enter nickname (optional)"
              />
               <p className="text-xs text-muted-foreground px-1">Leave blank to remove an existing nickname.</p>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="button" onClick={handleSaveNickname}>Save Nickname</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {memberToBanDetails && (
        <Dialog open={isBanDialogOpen} onOpenChange={setIsBanDialogOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Ban Member: {memberToBanDetails.memberName}</DialogTitle>
                    <DialogDescription>
                        Select the duration and provide a reason for banning this member from {tribe.name}. This action may impact their overall reputation.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div>
                        <Label className="text-sm font-medium">Ban Duration from {tribe.name}</Label>
                        <RadioGroup value={banDuration} onValueChange={setBanDuration} className="mt-2 space-y-1">
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="1_day" id="ban-1day-tribe" />
                                <Label htmlFor="ban-1day-tribe" className="font-normal">1 Day</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="7_days" id="ban-7days-tribe" />
                                <Label htmlFor="ban-7days-tribe" className="font-normal">7 Days</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="30_days" id="ban-30days-tribe" />
                                <Label htmlFor="ban-30days-tribe" className="font-normal">30 Days</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="permanent_from_tribe" id="ban-permanent-tribe" />
                                <Label htmlFor="ban-permanent-tribe" className="font-normal">Permanent from this Tribe</Label>
                            </div>
                        </RadioGroup>
                    </div>
                    <div>
                        <Label htmlFor="ban-reason-tribe" className="text-sm font-medium">Reason for Ban (Optional)</Label>
                        <Textarea
                            id="ban-reason-tribe"
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
                    <Button type="button" variant="destructive" onClick={handleConfirmBan}>Confirm Tribe Ban</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      )}

      {/* Decline All Confirmation Dialog */}
      <Dialog open={showDeclineAllConfirm} onOpenChange={setShowDeclineAllConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Decline All Requests?</DialogTitle>
            <DialogDescription>
              Are you sure you want to decline all {pendingMembers.length} pending request{pendingMembers.length !== 1 ? 's' : ''}? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={isBulkProcessing}
              onClick={() => handleBulkDeny(pendingMembers.map(m => m.id))}
            >
              {isBulkProcessing
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Declining...</>
                : <>Decline All {pendingMembers.length} Requests</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
