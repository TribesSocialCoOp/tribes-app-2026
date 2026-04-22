
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
  image: z.custom<File | undefined>().refine(file => !file || (file instanceof File && file.size <= 5 * 1024 * 1024), `Max file size is 5MB.`),
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
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const form = useForm<PostFormValues>({
    resolver: zodResolver(postFormSchema),
    defaultValues: {
      title: "",
      content: "",
      image: undefined,
    },
  });

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

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={onOpenChange} className="sm:max-w-2xl">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle className="flex items-center">
              <Edit3 className="mr-2 h-5 w-5 text-primary" /> Create Post
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              Create a new private post on your wall. You can share it with tribes later.
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <div className="space-y-4">
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
