

"use client";

import { useRouter } from 'next/navigation';
import { useTribeIdFromParams } from '@/hooks/use-tribe-id';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, UsersRound, Pencil, UserCheck, UserX, Hammer, MoreVertical, ShieldAlert, Check, X, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import React, { useEffect, useState, useCallback } from 'react';
import { useToast } from "@/hooks/use-toast";
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/use-user';

import type { TribeMember, PendingMember } from '@/lib/types';
import type { Tribe } from '@/lib/types';
import { getTribeById, getTribeMembers, getPendingMembers, updateMemberNickname, updateMemberRole, approveJoinRequest, denyJoinRequest, checkTribeAccess } from '@/lib/actions/tribe-actions';
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
  const { tribeId } = useTribeIdFromParams();
  const { toast } = useToast();
  const { role } = useUser();

  const [tribe, setTribe] = useState<Tribe | null>(null);
  const [currentTribeMembers, setCurrentTribeMembers] = useState<TribeMember[]>([]);
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);

  const [isNicknameDialogOpen, setIsNicknameDialogOpen] = useState(false);
  const [memberToEditNickname, setMemberToEditNickname] = useState<TribeMember | null>(null);
  const [nicknameInputValue, setNicknameInputValue] = useState("");

  const [isBanDialogOpen, setIsBanDialogOpen] = useState(false);
  const [memberToBanDetails, setMemberToBanDetails] = useState<{ memberId: string; memberName: string; } | null>(null);
  const [banDuration, setBanDuration] = useState("permanent_from_tribe"); 
  const [banReason, setBanReason] = useState("");
  
  const [hasAccess, setHasAccess] = useState<boolean | undefined>(undefined);

  const reloadData = useCallback(async () => {
    if (!tribeId) return;
    setIsDataLoading(true);
    const [tribeData, membersData, pendingData] = await Promise.all([
      getTribeById(tribeId),
      getTribeMembers(tribeId),
      getPendingMembers(tribeId)
    ]);
    setTribe(tribeData);
    setCurrentTribeMembers(membersData);
    setPendingMembers(pendingData);
    setIsDataLoading(false);
  }, [tribeId]);

  useEffect(() => {
    const resolveAccess = async () => {
      const accessLevel = await checkTribeAccess(tribeId);
      // Speakers and above can access member management
      const canAccess = accessLevel === 'platform_admin' || accessLevel === 'founder' || accessLevel === 'speaker';
      setHasAccess(canAccess);
      if (canAccess) {
        reloadData();
      }
    };
    resolveAccess();
  }, [tribeId, reloadData]);

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
    await approveJoinRequest(tribeId, pendingMember.id);
    toast({
      title: "Member Approved",
      description: `${pendingMember.name} has been added to the tribe.`,
    });
    reloadData();
  };

  const handleDenyRequest = async (pendingMemberId: string, memberName: string) => {
    await denyJoinRequest(tribeId, pendingMemberId);
    toast({
      title: "Request Denied",
      description: `The request from ${memberName} has been denied.`,
      variant: 'destructive'
    });
    reloadData();
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
            <Button onClick={() => router.back()}>
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
      <div className="flex items-center">
        <Button variant="outline" size="sm" onClick={() => router.push(`/t/${tribe?.slug || tribeId}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to {tribe.name}
        </Button>
      </div>

      {tribe.joinMechanism === 'approval' && pendingMembers.length > 0 && (
          <Card className="shadow-lg border-amber-500/50">
              <CardHeader>
                  <CardTitle className="text-xl tracking-normal">Pending Join Requests ({pendingMembers.length})</CardTitle>
                  <CardDescription>Approve or deny requests to join {tribe.name}.</CardDescription>
              </CardHeader>
              <CardContent>
                  <div className="space-y-2">
                      {pendingMembers.map(member => (
                          <div key={member.id} className="flex items-center justify-between p-2 border rounded-md">
                            <div className="flex items-center space-x-3">
                                  <Avatar className="h-9 w-9">
                                      <AvatarImage src={member.avatar} alt={member.name} data-ai-hint={member.dataAiHint} />
                                      <AvatarFallback>{member.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                                  </Avatar>
                                  <div>
                                      <p className="font-semibold text-sm">{member.name}</p>
                                      <p className="text-xs text-muted-foreground">Requested {new Date(member.requestTimestamp).toLocaleDateString()}</p>
                                  </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                  <Button size="icon" variant="outline" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDenyRequest(member.id, member.name)}>
                                      <X className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="outline" className="h-8 w-8 text-green-600 hover:bg-green-500/10 hover:text-green-600" onClick={() => handleApproveRequest(member)}>
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
        </CardHeader>
        <CardContent>
          {currentTribeMembers.length > 0 ? (
            <div className="space-y-3">
              {currentTribeMembers.map(member => (
                <Card key={member.id} className="p-3 flex items-center justify-between hover:bg-muted/30 transition-colors">
                  <div className="flex items-center space-x-3 flex-grow">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={member.avatar} alt={member.name} data-ai-hint={member.dataAiHint} />
                      <AvatarFallback>{member.name.substring(0,2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-grow">
                      <p className="font-semibold text-sm">{member.name}</p>
                      {member.tribeAssignedNickname ? (
                        <p className="text-xs text-primary mt-0.5">Nickname: <span className="italic">{member.tribeAssignedNickname}</span></p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-0.5">No tribe-specific nickname.</p>
                      )}
                      <div className="flex items-center space-x-2 mt-1.5">
                          <Badge variant={member.role === 'founder' ? 'default' : member.role === 'speaker' ? "default" : "outline"} className={cn("text-xs", member.role === 'founder' ? "bg-amber-600 text-white" : member.role === 'speaker' ? "bg-primary text-primary-foreground" : "border-muted-foreground text-muted-foreground")}>
                              {member.role === 'founder' ? 'Founder' : member.role === 'speaker' ? 'Speaker' : 'Member'}
                          </Badge>
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground shrink-0">
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">Member Actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleOpenNicknameDialog(member)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        {member.tribeAssignedNickname ? "Edit" : "Assign"} Nickname
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggleSpeakerRole(member)}>
                        {member.role === 'speaker' ? <UserX className="mr-2 h-4 w-4" /> : <UserCheck className="mr-2 h-4 w-4" />}
                        {member.role === 'speaker' ? 'Demote to Member' : 'Make Speaker'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => handleOpenBanDialog(member)} 
                        className="text-destructive hover:!bg-destructive/10 hover:!text-destructive focus:!bg-destructive/10 focus:!text-destructive"
                      >
                        <Hammer className="mr-2 h-4 w-4" />
                        Ban Member
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
    </div>
  );
}
