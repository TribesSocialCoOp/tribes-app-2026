
"use client";

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, UsersRound, Pencil, UserCircle } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { tribesData, type Tribe } from '../../page'; // Corrected import path
import { useToast } from "@/hooks/use-toast";

// Re-defining TribeMember and initialMockMembers here for now.
// Ideally, TribeMember would be in lib/types.ts and initialMockMembers could be shared or fetched.
export interface TribeMember {
  id: string;
  name: string;
  avatar: string;
  dataAiHint: string;
  tribeAssignedNickname?: string;
}

const initialMockMembers: Omit<TribeMember, 'tribeAssignedNickname'>[] = [
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

  useEffect(() => {
    if (tribeId) {
      const currentTribeData = tribesData.find(t => t.id === tribeId);
      setTribe(currentTribeData || null);
      if (currentTribeData) {
        const membersForThisTribe = initialMockMembers.map(member => ({
            ...member,
            // Example initial nickname assignment logic (can be expanded)
            tribeAssignedNickname: (member.id === 'user1' && tribeId === '1') ? 'AI Lead' :
                                   (member.id === 'user2' && tribeId === '2') ? 'Trail Master' : undefined
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
              <CardDescription>View, assign nicknames, and manage members for {tribe.name}.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {currentTribeMembers.length > 0 ? (
            <div className="space-y-3">
              {currentTribeMembers.map(member => (
                <Card key={member.id} className="p-3 flex items-center justify-between hover:bg-muted/30 transition-colors">
                  <div className="flex items-center space-x-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={member.avatar} alt={member.name} data-ai-hint={member.dataAiHint} />
                      <AvatarFallback>{member.name.substring(0,2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-sm">{member.name}</p>
                      {member.tribeAssignedNickname ? (
                        <p className="text-xs text-primary">Nickname: <span className="italic">{member.tribeAssignedNickname}</span></p>
                      ) : (
                        <p className="text-xs text-muted-foreground">No tribe-specific nickname assigned.</p>
                      )}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handleOpenNicknameDialog(member)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    {member.tribeAssignedNickname ? "Edit" : "Assign"} Nickname
                  </Button>
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
    </div>
  );
}

    