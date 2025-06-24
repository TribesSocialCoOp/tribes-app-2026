
"use client";

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, UsersRound, Pencil, UserCheck, UserX, Hammer, MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import React, { useEffect, useState } from 'react';
import { tribesData, type Tribe } from '@/lib/data';
import { useToast } from "@/hooks/use-toast";
import { cn } from '@/lib/utils';

export interface TribeMember {
  id: string;
  name: string;
  avatar: string;
  dataAiHint: string;
  tribeAssignedNickname?: string;
  role?: 'member' | 'speaker';
}

const initialMockMembers: Omit<TribeMember, 'tribeAssignedNickname' | 'role'>[] = [
  { id: 'user1', name: 'Alice Wonderland', avatar: 'https://placehold.co/40x40.png?text=AW', dataAiHint: 'avatar person' },
  { id: 'user2', name: 'Bob The Builder', avatar: 'https://placehold.co/40x40.png?text=BB', dataAiHint: 'avatar character' },
  { id: 'user3', name: 'Charlie Chaplin', avatar: 'https://placehold.co/40x40.png?text=CC', dataAiHint: 'avatar person' },
  { id: 'user4', name: 'Diana Prince', avatar: 'https://placehold.co/40x40.png?text=DP', dataAiHint: 'avatar hero' },
  { id: 'user5', name: 'Edward Elric', avatar: 'https://placehold.co/40x40.png?text=EE', dataAiHint: 'avatar anime' },
];


export default function ManageMembersPage() {
  const router = useRouter();
  const params = useParams();
  const tribeId = params.tribeId as string;
  const { toast } = useToast();

  const [tribe, setTribe] = useState<Tribe | null>(null);
  const [currentTribeMembers, setCurrentTribeMembers] = useState<TribeMember[]>([]);
  const [isNicknameDialogOpen, setIsNicknameDialogOpen] = useState(false);
  const [memberToEditNickname, setMemberToEditNickname] = useState<TribeMember | null>(null);
  const [nicknameInputValue, setNicknameInputValue] = useState("");

  const [isBanDialogOpen, setIsBanDialogOpen] = useState(false);
  const [memberToBanDetails, setMemberToBanDetails] = useState<{ memberId: string; memberName: string; } | null>(null);
  const [banDuration, setBanDuration] = useState("permanent_from_tribe"); 
  const [banReason, setBanReason] = useState("");


  useEffect(() => {
    if (tribeId) {
      const currentTribeData = tribesData.find(t => t.id === tribeId);
      setTribe(currentTribeData || null);
      if (currentTribeData) {
        const membersForThisTribe = initialMockMembers.map(member => ({
            ...member,
            tribeAssignedNickname: (member.id === 'user1' && tribeId === '1') ? 'AI Lead' :
                                   (member.id === 'user2' && tribeId === '2') ? 'Trail Master' : undefined,
            role: (member.id === 'user1' && tribeId === '1') ? 'speaker' : 'member' as 'member' | 'speaker'
        }));
        setCurrentTribeMembers(membersForThisTribe);
      }
    }
  }, [tribeId]);

  const handleOpenNicknameDialog = (member: TribeMember) => {
    setMemberToEditNickname(member);
    setNicknameInputValue(member.tribeAssignedNickname || "");
    setIsNicknameDialogOpen(true);
  };

  const handleSaveNickname = () => {
    if (!memberToEditNickname) return;

    setCurrentTribeMembers(prevMembers =>
      prevMembers.map(member =>
        member.id === memberToEditNickname.id
          ? { ...member, tribeAssignedNickname: nicknameInputValue.trim() || undefined }
          : member
      )
    );
    toast({
      title: "Nickname Updated",
      description: `Nickname for ${memberToEditNickname.name} has been ${nicknameInputValue.trim() ? 'set to "' + nicknameInputValue.trim() + '"' : 'cleared'}.`,
    });
    setIsNicknameDialogOpen(false);
    setMemberToEditNickname(null);
    setNicknameInputValue("");
  };

  const handleToggleSpeakerRole = (memberId: string) => {
    setCurrentTribeMembers(prevMembers =>
      prevMembers.map(member => {
        if (member.id === memberId) {
          const newRole = member.role === 'speaker' ? 'member' : 'speaker';
          const targetMember = prevMembers.find(m => m.id === memberId);
          toast({
            title: `Role Updated for ${targetMember?.name || 'Member'}`,
            description: `${targetMember?.name || 'The member'} is now a ${newRole}.`,
          });
          return { ...member, role: newRole };
        }
        return member;
      })
    );
  };

  const handleOpenBanDialog = (member: TribeMember) => {
    if (!member || !member.id || !member.name) {
        toast({ variant: "destructive", title: "Error", description: "Cannot ban member: missing member details."});
        return;
    }
    setMemberToBanDetails({ memberId: member.id, memberName: member.name });
    setIsBanDialogOpen(true);
  };

  const handleConfirmBan = () => {
    if (!memberToBanDetails || !tribe) return;

    console.log("Banning member from tribe:", {
        memberId: memberToBanDetails.memberId,
        memberName: memberToBanDetails.memberName,
        tribeId: tribe.id,
        tribeName: tribe.name,
        duration: banDuration,
        reason: banReason,
    });

    let durationText = "permanently from this tribe";
    if (banDuration === "1_day") durationText = "for 1 day from this tribe";
    else if (banDuration === "7_days") durationText = "for 7 days from this tribe";
    else if (banDuration === "30_days") durationText = "for 30 days from this tribe";
    
    toast({
      title: "Member Banned from Tribe (Simulated)",
      description: `Member ${memberToBanDetails.memberName} has been banned ${durationText}. Their reputation may be impacted (Simulated). ${banReason ? `Reason: ${banReason}` : ''}`,
      variant: "destructive",
    });

    setCurrentTribeMembers(prevMembers => prevMembers.filter(m => m.id !== memberToBanDetails.memberId));

    setIsBanDialogOpen(false);
    setMemberToBanDetails(null);
    setBanDuration("permanent_from_tribe");
    setBanReason("");
  };


  if (!tribe) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-height,4rem)-2rem)]">
        <p className="text-muted-foreground">Loading tribe information...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <Button variant="outline" size="sm" onClick={() => router.push(`/tribes/${tribeId}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to {tribe.name}
        </Button>
      </div>

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
                        <p className="text-xs text-primary">Nickname: <span className="italic">{member.tribeAssignedNickname}</span></p>
                      ) : (
                        <p className="text-xs text-muted-foreground">No tribe-specific nickname.</p>
                      )}
                       <Badge variant={member.role === 'speaker' ? "default" : "outline"} className={cn("text-xs mt-1", member.role === 'speaker' ? "bg-primary text-primary-foreground" : "border-muted-foreground text-muted-foreground")}>
                        {member.role === 'speaker' ? 'Speaker' : 'Member'}
                      </Badge>
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
                      <DropdownMenuItem onClick={() => handleToggleSpeakerRole(member.id)}>
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
                <p className="text-sm text-muted-foreground">No members found for this tribe (this is mock data).</p>
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
