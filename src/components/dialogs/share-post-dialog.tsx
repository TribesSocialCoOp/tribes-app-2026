
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
import { Form, FormControl, FormItem, FormLabel, FormDescription } from "@/components/ui/form";
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMobile } from "@/hooks/use-mobile";
import { Share2, Users as UsersIcon } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { getTribes } from '@/lib/data-access/tribes';
import type { Tribe } from '@/lib/data';
import type { TribePost } from '@/lib/types';


interface SharePostDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  post: (Partial<TribePost> & { id: string, sharedWith?: string[] }) | null;
  onConfirmShare: (postId: string, updatedTribeList: string[]) => void;
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
  const [selectedTribes, setSelectedTribes] = useState<string[]>([]);

  // Create a dummy form instance to satisfy the Form provider context.
  const form = useForm();

  useEffect(() => {
    if (isOpen) {
      const fetchUserTribes = async () => {
        const baseTribeMemberships = ['1', '3', '6', '7'];
        const createdTribeIds: string[] = JSON.parse(localStorage.getItem('myCreatedTribeIds') || '[]');
        const myTribeIds = [...new Set([...baseTribeMemberships, ...createdTribeIds])];
        
        const allTribes = await getTribes();
        const userTribes = allTribes.filter(t => myTribeIds.includes(t.id));
        setMyTribes(userTribes);
      };
      fetchUserTribes();

      // Set initial selected state from the post prop
      setSelectedTribes(post?.sharedWith || []);
    }
  }, [isOpen, post]);

  if (!post) return null;

  const handleShare = () => {
    onConfirmShare(post.id, selectedTribes);
    toast({
        title: "Sharing Updated",
        description: `Your post "${post.title || 'Untitled Post'}" sharing settings have been saved.`,
    });
  };

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
              Select which tribes you'd like to share "<span className="italic font-semibold">{post.title || "this post"}</span>" with.
            </DialogDescriptionComponent>
          </DialogHeaderComponent>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <ScrollArea className="h-full">
              <div className="mb-2">
                  <FormLabel className="text-md flex items-center">
                      <UsersIcon className="mr-2 h-4 w-4 text-muted-foreground"/> Share with Tribes
                  </FormLabel>
                  <FormDescription>Select tribes to share this post with.</FormDescription>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-2 rounded-md border p-3">
              {myTribes.length > 0 ? (
                  myTribes.map((item) => (
                      <FormItem
                          key={item.id}
                          className="flex flex-row items-start space-x-3 space-y-0"
                      >
                          <FormControl>
                          <Checkbox
                              checked={selectedTribes.includes(item.name)}
                              onCheckedChange={(checked) => {
                                  const newSelection = checked
                                      ? [...selectedTribes, item.name]
                                      : selectedTribes.filter((name) => name !== item.name);
                                  setSelectedTribes(newSelection);
                              }}
                          />
                          </FormControl>
                          <FormLabel className="font-normal">
                          {item.name}
                          </FormLabel>
                      </FormItem>
                  ))
              ) : (
                  <p className="text-sm text-muted-foreground text-center py-2">You are not a member of any tribes.</p>
              )}
              </div>
          </ScrollArea>
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
