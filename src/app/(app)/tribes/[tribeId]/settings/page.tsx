
"use client";

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Settings as SettingsIcon, Globe, Lock } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

import { tribesData, type Tribe } from '../../page'; // Corrected import path

const tribeSettingsFormSchema = z.object({
  name: z.string().min(3, { message: "Tribe name must be at least 3 characters." }).max(50),
  description: z.string().min(10, { message: "Description must be at least 10 characters." }).max(500),
  isPublic: z.boolean().default(true),
  // coverImage: z.instanceof(File).optional().refine(file => !file || file.size <= 5 * 1024 * 1024, `Max file size is 5MB.`), // Add later if needed
});

type TribeSettingsFormValues = z.infer<typeof tribeSettingsFormSchema>;

export default function TribeSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const tribeId = params.tribeId as string;
  const { toast } = useToast();

  const [tribe, setTribe] = useState<Tribe | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<TribeSettingsFormValues>({
    resolver: zodResolver(tribeSettingsFormSchema),
    defaultValues: {
      name: "",
      description: "",
      isPublic: true,
    },
  });

  useEffect(() => {
    if (tribeId) {
      const currentTribeData = tribesData.find(t => t.id === tribeId);
      if (currentTribeData) {
        setTribe(currentTribeData);
        form.reset({
          name: currentTribeData.name,
          description: currentTribeData.description,
          isPublic: currentTribeData.isPublic,
        });
      } else {
        router.push('/tribes'); // Redirect if tribe not found
      }
    }
  }, [tribeId, form, router]);

  async function onSubmit(values: TribeSettingsFormValues) {
    setIsLoading(true);
    console.log("Tribe Settings Update Submitted:", values);
    // Simulate API call to update tribe settings
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // In a real app, you would update the source of truth (e.g., database)
    // and then potentially update the local state or re-fetch.
    // For this mock, we'll just show a toast and potentially update the local `tribe` state.
    if (tribe) {
        setTribe(prevTribe => prevTribe ? {...prevTribe, ...values} : null);
    }

    toast({
      title: "Settings Saved (Simulated)",
      description: `Settings for tribe "${values.name}" have been updated.`,
    });
    setIsLoading(false);
  }

  if (!tribe) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-height,4rem)-2rem)]">
        <p className="text-muted-foreground">Loading tribe information...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center mt-2">
        <Button variant="outline" size="sm" onClick={() => router.push(`/tribes/${tribeId}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to {tribe.name}
        </Button>
      </div>

      <Card className="shadow-xl">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <SettingsIcon className="h-7 w-7 text-primary" />
            <div>
              <CardTitle className="text-2xl font-semibold tracking-normal">Tribe Settings: {tribe.name}</CardTitle>
              <CardDescription>Manage the core settings for your tribe.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-md">Tribe Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your tribe's awesome name" {...field} className="text-base"/>
                    </FormControl>
                    <FormDescription>The public name of your tribe.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-md">Tribe Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="What is your tribe all about?"
                        className="resize-none min-h-[100px] text-base"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>A brief description of your tribe's purpose and activities.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="isPublic"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base font-semibold">
                        Tribe Visibility
                      </FormLabel>
                      <FormDescription>
                        {field.value ? (
                          <>
                            <Globe className="inline-block mr-1 h-4 w-4 text-green-500" />
                            Public: Discoverable by anyone on the platform.
                          </>
                        ) : (
                          <>
                            <Lock className="inline-block mr-1 h-4 w-4 text-red-500" />
                            Private: Only users with a direct link or invite can see this tribe.
                          </>
                        )}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isLoading} className="w-full md:w-auto bg-primary hover:bg-primary/90 text-lg py-3 px-6">
                {isLoading ? "Saving..." : "Save Settings"}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}

