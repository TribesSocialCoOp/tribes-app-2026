
"use client";

import React, { useState, useEffect } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Edit3, Image as ImageIcon } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import {
  ResponsiveDialog, ResponsiveDialogHeader, ResponsiveDialogTitle,
  ResponsiveDialogDescription, ResponsiveDialogFooter
} from "@/components/ui/responsive-dialog";

const postFormSchema = z.object({
  title: z.string().max(150, { message: "Title cannot be more than 150 characters." }).optional(),
  content: z.string().min(1, { message: "Post content cannot be empty." }).max(5000, { message: "Post content cannot exceed 5000 characters." }),
  images: z.array(z.custom<File>().refine(file => file instanceof File && file.size <= 5 * 1024 * 1024, `Max file size is 5MB.`)).optional().default([]),
});

export type PostFormValues = z.infer<typeof postFormSchema>;

interface CreatePostDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onPostCreated: (newPostData: PostFormValues) => void;
}

export function CreatePostDialog({
  isOpen,
  onOpenChange,
  onPostCreated,
}: CreatePostDialogProps) {
  const { toast } = useToast();
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  const form = useForm<PostFormValues>({
    resolver: zodResolver(postFormSchema),
    defaultValues: {
      title: "",
      content: "",
      images: [],
    },
  });

  useEffect(() => {
    if (!isOpen) {
      form.reset();
      setImagePreviews([]);
    }
  }, [isOpen, form]);

  const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const newFiles = Array.from(files);
      
      // Normalize images: convert HEIC/HEIF→JPEG, compress large files
      const { normalizeImage } = await import('@/lib/image-utils');
      const normalizedNewFiles = await Promise.all(newFiles.map(f => normalizeImage(f)));

      const currentFiles = form.getValues("images") || [];
      const updatedFiles = [...currentFiles, ...normalizedNewFiles].slice(0, 4); // Limit to 4 images
      
      form.setValue("images", updatedFiles, { shouldValidate: true });
      
      // Update previews
      const newPreviews: string[] = [];
      let loaded = 0;
      updatedFiles.forEach((file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          newPreviews.push(reader.result as string);
          loaded++;
          if (loaded === updatedFiles.length) {
            setImagePreviews(newPreviews);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeImage = (index: number) => {
    const currentFiles = form.getValues("images") || [];
    const updatedFiles = currentFiles.filter((_, i) => i !== index);
    form.setValue("images", updatedFiles, { shouldValidate: true });
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  function onSubmit(values: PostFormValues) {
    onPostCreated(values);
  }

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={onOpenChange} className="sm:max-w-2xl">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle className="flex items-center">
              <Edit3 className="mr-2 h-5 w-5 text-primary" /> Create Post
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              Create a new post for this tribe.
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <div className="space-y-4 px-4 sm:px-0">
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
              name="images"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Images (Optional)</FormLabel>
                    <FormControl>
                      <div className="space-y-4">
                        {imagePreviews.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {imagePreviews.map((preview, idx) => (
                              <div key={idx} className="relative aspect-square rounded-md overflow-hidden border group">
                                <Image src={preview} alt={`Preview ${idx}`} fill className="object-cover" />
                                <button
                                  type="button"
                                  onClick={() => removeImage(idx)}
                                  className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center space-x-4">
                          {imagePreviews.length < 4 && (
                            <div className="flex-1">
                              <Input 
                                type="file" 
                                accept="image/*" 
                                multiple 
                                onChange={handleImageChange} 
                                className="cursor-pointer"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </FormControl>
                  <FormDescription>Upload up to 4 images (max 5MB each).</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <ResponsiveDialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={form.formState.isSubmitting} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              {form.formState.isSubmitting ? "Posting..." : "Create Post"}
            </Button>
          </ResponsiveDialogFooter>
        </form>
      </Form>
    </ResponsiveDialog>
  );
}
