
"use client";

import React, { useState, useEffect } from 'react';
import { useForm } from "react-hook-form";
import {
  Dialog, DialogContent as ShadDialogContent, DialogHeader as ShadDialogHeader, DialogTitle as ShadDialogTitle, DialogDescription as ShadDialogDescription, DialogFooter as ShadDialogFooter
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent as ShadSheetContent, SheetHeader as ShadSheetHeader, SheetTitle as ShadSheetTitle, SheetDescription as ShadSheetDescription, SheetFooter as ShadSheetFooter
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormItem, FormLabel } from "@/components/ui/form";
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMobile } from "@/hooks/use-mobile";
import { Share2, Users as UsersIcon, UserCircle, AtSign, Loader2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getTribes } from '@/lib/data-access/tribes';
import type { Tribe } from '@/lib/data';
import type { TribePost, UserProfile } from '@/lib/types';
import { getUserProfile } from '@/lib/services/user-service';
import { MOCK_CURRENT_USER_ID } from '@/lib/data';

interface SharePostDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  post: (Partial<TribePost> & { id: string, sharedWith?: Record<string, string> }) | null;
  onConfirmShare: (postId: string, updatedTribeShares: Record<string, string>) => void;
}

export function SharePostDialog({
  isOpen,
  onOpenChange,
  post,
  onConfirmShare,
}: SharePostDialogProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [myTribes, setMyTribes] = useState<Tribe[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [selectedTribeShares, setSelectedTribeShares] = useState<Record<string, string>>({});

  const form = useForm();

  useEffect(() => {
    if (isOpen) {
      const fetchUserData = async () => {
        setIsLoadingProfile(true);
        const [profile, allTribes] = await Promise.all([
          getUserProfile(MOCK_CURRENT_USER_ID),
          getTribes()
        ]);
        setUserProfile(profile);

        const baseTribeMemberships = ['1', '3', '6', '7'];
        const createdTribeIds: string[] = JSON.parse(localStorage.getItem('myCreatedTribeIds') || '[]');
        const myTribeIds = [...new Set([...baseTribeMemberships, ...createdTribeIds])];
        const userTribes = allTribes.filter(t => myTribeIds.includes(t.id));
        setMyTribes(userTribes);
        
        setIsLoadingProfile(false);
      };
      fetchUserData();
      setSelectedTribeShares(post?.sharedWith || {});
    }
  }, [isOpen, post]);

  if (!post) return null;

  const handleShare = () => {
    onConfirmShare(post.id, selectedTribeShares);
    toast({
      title: "Sharing Updated",
      description: `Your post "${post.title || 'Untitled Post'}" sharing settings have been saved.`,
    });
  };
  
  const handleTribeCheckChange = (checked: boolean | 'indeterminate', tribeName: string) => {
    const newSelection = { ...selectedTribeShares };
    if (checked) {
      newSelection[tribeName] = "main_profile"; // Default to main profile
    } else {
      delete newSelection[tribeName];
    }
    setSelectedTribeShares(newSelection);
  };
  
  const handleAliasChange = (tribeName: string, alias: string) => {
    setSelectedTribeShares(prev => ({ ...prev, [tribeName]: alias }));
  };
  
  const identityOptions = [
    { value: "main_profile", label: userProfile?.name || "Main Profile", icon: UserCircle },
    ...(userProfile?.aliases?.map(alias => ({ value: alias, label: alias, icon: AtSign })) || [])
  ];

  const DialogContentComponent = isMobile ? ShadSheetContent : ShadDialogContent;
  const DialogHeaderComponent = isMobile ? ShadSheetHeader : ShadDialogHeader;
  const DialogTitleComponent = isMobile ? ShadSheetTitle : ShadDialogTitle;
  const DialogDescriptionComponent = isMobile ? ShadSheetDescription : ShadDialogDescription;
  const DialogFooterComponent = isMobile ? ShadSheetFooter : ShadDialogFooter;
  const RootComponent = isMobile ? Sheet : Dialog;

  const commonContent = (
    <Form {...form}>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="p-4 sm:p-6 border-b">
          <DialogHeaderComponent>
            <DialogTitleComponent className="flex items-center">
              <Share2 className="mr-2 h-5 w-5 text-primary" /> Share Post
            </DialogTitleComponent>
            <DialogDescriptionComponent>
              Choose which tribes to share "<span className="italic font-semibold">{post.title || "this post"}</span>" with, and which persona to use.
            </DialogDescriptionComponent>
          </DialogHeaderComponent>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {isLoadingProfile ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ScrollArea className="h-full">
                <div className="space-y-4">
                  {myTribes.length > 0 ? (
                    myTribes.map((tribe) => {
                      const isChecked = Object.keys(selectedTribeShares).includes(tribe.name);
                      return (
                        <div key={tribe.id} className="p-3 border rounded-lg transition-colors data-[checked=true]:bg-muted/50" data-checked={isChecked}>
                          <div className="flex items-center space-x-3">
                            <Checkbox
                              id={`tribe-check-${tribe.id}`}
                              checked={isChecked}
                              onCheckedChange={(checked) => handleTribeCheckChange(!!checked, tribe.name)}
                            />
                            <FormLabel htmlFor={`tribe-check-${tribe.id}`} className="font-medium flex-1 cursor-pointer">
                              {tribe.name}
                            </FormLabel>
                          </div>
                          {isChecked && (
                            <div className="pl-8 pt-2">
                              <Select
                                value={selectedTribeShares[tribe.name]}
                                onValueChange={(value) => handleAliasChange(tribe.name, value)}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Select persona..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {identityOptions.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                      <div className="flex items-center">
                                        <opt.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                                        <span>{opt.label}</span>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                      )
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">You are not a member of any tribes.</p>
                  )}
                </div>
            </ScrollArea>
          )}
        </div>
        <div className="p-4 sm:p-6 border-t">
          <DialogFooterComponent>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="button" onClick={handleShare} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              Update Sharing
            </Button>
          </DialogFooterComponent>
        </div>
      </div>
    </Form>
  );

  if (isMobile) {
    return (
      <RootComponent open={isOpen} onOpenChange={onOpenChange}>
        <DialogContentComponent side="bottom" className="h-auto max-h-[90vh] flex flex-col p-0">
          {commonContent}
        </DialogContentComponent>
      </RootComponent>
    );
  }

  return (
    <RootComponent open={isOpen} onOpenChange={onOpenChange}>
      <DialogContentComponent className="sm:max-w-xl p-0 h-auto max-h-[90vh] flex flex-col">
        {commonContent}
      </DialogContentComponent>
    </RootComponent>
  );
}
