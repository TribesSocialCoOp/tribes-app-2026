
"use client";

import React, { useState, useEffect } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Image from "next/image";

import {
  Dialog, DialogContent as ShadDialogContent, DialogHeader as ShadDialogHeader, DialogTitle as ShadDialogTitle, DialogDescription as ShadDialogDescription, DialogFooter as ShadDialogFooter
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent as ShadSheetContent, SheetHeader as ShadSheetHeader, SheetTitle as ShadSheetTitle, SheetDescription as ShadSheetDescription, SheetFooter as ShadSheetFooter
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMobile } from "@/hooks/use-mobile";
import { Edit3, Image as ImageIcon, Users as UsersIcon } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { getTribes } from '@/lib/data-access/tribes';
import type { Tribe } from '@/lib/data';

const postFormSchema = z.object({
  title: z.string().max(150, { message: "Title cannot be more than 150 characters." }).optional(),
  content: z.string().min(1, { message: "Post content cannot be empty." }).max(5000, { message: "Post content cannot exceed 5000 characters." }),
  image: z.custom<File | undefined>().refine(file => !file || (file instanceof File && file.size <= 5 * 1024 * 1024), `Max file size is 5MB.`),
  tribes: z.array(z.string()).optional(),
});

export type PostFormValues = z.infer<typeof postFormSchema>;

interface CreatePostDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onPostCreated: (newPostData: PostFormValues) => void;
  tribeName: string;
}

export function CreatePostDialog({
  isOpen,
  onOpenChange,
  onPostCreated,
  tribeName
}: CreatePostDialogProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [myTribes, setMyTribes] = useState<Tribe[]>([]);

  const form = useForm<PostFormValues>({
    resolver: zodResolver(postFormSchema),
    defaultValues: {
      title: "",
      content: "",
      image: undefined,
      tribes: [],
    },
  });

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
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      form.reset();
      setImagePreview(null);
    }
  }, [isOpen, form]);

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      form.setValue("image", file, { shouldValidate: true });
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      form.setValue("image", undefined);
      setImagePreview(null);
    }
  };

  function onSubmit(values: PostFormValues) {
    onPostCreated(values);
  }

  const DialogContentComponent = isMobile ? ShadSheetContent : ShadDialogContent;
  const DialogHeaderComponent = isMobile ? ShadSheetHeader : ShadDialogHeader;
  const DialogTitleComponent = isMobile ? ShadSheetTitle : ShadDialogTitle;
  const DialogDescriptionComponent = isMobile ? ShadSheetDescription : ShadDialogDescription;
  const DialogFooterComponent = isMobile ? ShadSheetFooter : ShadDialogFooter;
  const RootComponent = isMobile ? Sheet : Dialog;

  const commonContent = (
    <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full overflow-hidden">
            <DialogHeaderComponent className="p-4 sm:p-6 border-b">
              <DialogTitleComponent className="flex items-center">
                <Edit3 className="mr-2 h-5 w-5 text-primary" /> Create Post
              </DialogTitleComponent>
              <DialogDescriptionComponent>
                Create a new post for your wall. You can share it with tribes below.
              </DialogDescriptionComponent>
            </DialogHeaderComponent>

            <div className="flex-1 overflow-y-auto">
                <ScrollArea className="h-full">
                    <div className="p-4 sm:p-6 space-y-4">
                        <FormField
                          control={form.control}
                          name="title"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Post Title (Optional)</FormLabel>
                              <FormControl>
                                <Input placeholder="Title your thread (optional)" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="content"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Content</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Share your thoughts, questions, or updates..."
                                  className="resize-none min-h-[150px]"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="image"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Image (Optional)</FormLabel>
                                <FormControl>
                                  <div className="flex items-center space-x-4">
                                    {imagePreview ? (
                                      <Image src={imagePreview} alt="Post preview" width={100} height={100} className="rounded-md object-cover h-24 w-24 border" data-ai-hint="user upload" />
                                    ) : (
                                      <div className="h-24 w-24 rounded-md bg-muted flex items-center justify-center border">
                                        <ImageIcon className="h-10 w-10 text-muted-foreground" />
                                      </div>
                                    )}
                                    <Input type="file" accept="image/*" onChange={handleImageChange} className="max-w-xs"/>
                                  </div>
                                </FormControl>
                              <FormDescription>Upload an image for your post (max 5MB).</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="tribes"
                          render={() => (
                            <FormItem>
                              <div className="mb-2">
                                <FormLabel className="text-md flex items-center">
                                  <UsersIcon className="mr-2 h-4 w-4 text-muted-foreground"/> Share with Tribes (Optional)
                                </FormLabel>
                                <FormDescription>Select tribes to share this post with.</FormDescription>
                              </div>
                              <div className="max-h-40 overflow-y-auto space-y-2 rounded-md border p-3">
                                {myTribes.length > 0 ? (
                                  myTribes.map((item) => (
                                    <FormField
                                      key={item.id}
                                      control={form.control}
                                      name="tribes"
                                      render={({ field }) => {
                                        return (
                                          <FormItem
                                            key={item.id}
                                            className="flex flex-row items-start space-x-3 space-y-0"
                                          >
                                            <FormControl>
                                              <Checkbox
                                                checked={field.value?.includes(item.id)}
                                                onCheckedChange={(checked) => {
                                                  return checked
                                                    ? field.onChange([...(field.value || []), item.id])
                                                    : field.onChange(
                                                        field.value?.filter(
                                                          (value) => value !== item.id
                                                        )
                                                      )
                                                }}
                                              />
                                            </FormControl>
                                            <FormLabel className="font-normal">
                                              {item.name}
                                            </FormLabel>
                                          </FormItem>
                                        )
                                      }}
                                    />
                                  ))
                                ) : (
                                  <p className="text-sm text-muted-foreground text-center py-2">You are not a member of any tribes to share with.</p>
                                )}
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                    </div>
                </ScrollArea>
            </div>

            <DialogFooterComponent className="p-4 sm:p-6 border-t">
              <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={form.formState.isSubmitting} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                {form.formState.isSubmitting ? "Posting..." : "Create Post"}
              </Button>
            </DialogFooterComponent>
        </form>
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
      <DialogContentComponent className="sm:max-w-2xl p-0 h-auto max-h-[90vh] flex flex-col">
        {commonContent}
      </DialogContentComponent>
    </RootComponent>
  );
}
