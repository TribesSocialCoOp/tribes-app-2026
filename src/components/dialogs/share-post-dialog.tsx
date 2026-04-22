
"use client";

import React, { useState, useEffect } from 'react';
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormItem, FormLabel } from "@/components/ui/form";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Share2, Users as UsersIcon, UserCircle, AtSign, Loader2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getUserProfile } from '@/lib/actions/profile-actions';
import { getMyTribes } from '@/lib/actions/tribe-actions';
import { useUser } from '@/hooks/use-user';
import type { Tribe } from '@/lib/types';
import type { TribePost, UserProfile } from '@/lib/types';
import {
  ResponsiveDialog, ResponsiveDialogHeader, ResponsiveDialogTitle,
  ResponsiveDialogDescription, ResponsiveDialogFooter
} from "@/components/ui/responsive-dialog";

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
  const { toast } = useToast();
  const [myTribes, setMyTribes] = useState<Tribe[]>([]);
  const { user: sessionUser, isLoading: isUserLoading } = useUser();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [selectedTribeShares, setSelectedTribeShares] = useState<Record<string, string>>({});

  const form = useForm();

  useEffect(() => {
    if (isOpen && sessionUser) {
      const fetchUserData = async () => {
        setIsLoadingProfile(true);
        const [profile, userTribes] = await Promise.all([
          getUserProfile(sessionUser.id),
          getMyTribes(),
        ]);
        setUserProfile(profile);
        setMyTribes(userTribes);
        
        setIsLoadingProfile(false);
      };
      fetchUserData();
      setSelectedTribeShares(post?.sharedWith || {});
    }
  }, [isOpen, post, sessionUser]);

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
      newSelection[tribeName] = "main_profile";
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

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={onOpenChange} className="sm:max-w-xl">
      <Form {...form}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center">
            <Share2 className="mr-2 h-5 w-5 text-primary" /> Share Post
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Choose which tribes to share "<span className="italic font-semibold">{post.title || "this post"}</span>" with, and which persona to use.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="py-4">
          {isLoadingProfile ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ScrollArea className="h-auto max-h-[50vh]">
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

        <ResponsiveDialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={handleShare} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            Update Sharing
          </Button>
        </ResponsiveDialogFooter>
      </Form>
    </ResponsiveDialog>
  );
}
