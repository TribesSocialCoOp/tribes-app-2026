
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
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Settings as SettingsIcon, Globe, Lock, Tag } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { cn } from '@/lib/utils';

import { tribesData, type Tribe } from '../../page';
import { moodsData as allMoodsData } from '../../../moods/page';

const tribeSettingsFormSchema = z.object({
  name: z.string().min(3, { message: "Tribe name must be at least 3 characters." }).max(50),
  description: z.string().min(10, { message: "Description must be at least 10 characters." }).max(500),
  isPublic: z.boolean().default(true),
  moods: z.array(z.string())
    .max(3, { message: "You can select a maximum of 3 moods." })
    .optional()
    .default([]),
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
      moods: [],
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
          moods: currentTribeData.moods || [],
        });
      } else {
        router.push('/tribes'); 
      }
    }
  }, [tribeId, form, router]);

  async function onSubmit(values: TribeSettingsFormValues) {
    setIsLoading(true);
    console.log("Tribe Settings Update Submitted:", values);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (tribe) {
        setTribe(prevTribe => prevTribe ? {...prevTribe, ...values} : null);
    }

    toast({
      title: "Settings Saved (Simulated)",
      description: `Settings for tribe "${values.name}" have been updated. Moods selected: ${values.moods?.join(', ') || 'None'}.`,
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
              <CardDescription>Manage the core settings and associated moods for your tribe.</CardDescription>
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
                name="moods"
                render={({ field }) => (
                  <FormItem>
                    <div className="mb-2">
                      <FormLabel className="text-md flex items-center">
                        <Tag className="mr-2 h-4 w-4 text-muted-foreground"/> Associated Moods (Max 3)
                      </FormLabel>
                      <FormDescription className="mt-1">
                        Select up to 3 moods that best represent your tribe. These help users discover your tribe.
                      </FormDescription>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 border rounded-md">
                      {allMoodsData.map((moodOption) => {
                        const isChecked = field.value?.includes(moodOption.slug);
                        const isDisabled = !isChecked && (field.value?.length ?? 0) >= 3;
                        return (
                          <Label
                            key={moodOption.slug}
                            htmlFor={`mood-${moodOption.slug}`}
                            className={cn(
                              "flex items-center space-x-2 p-2 border rounded-md hover:bg-muted/50 cursor-pointer transition-colors",
                              isChecked && "bg-accent/70 border-accent",
                              isDisabled && "cursor-not-allowed opacity-60 hover:bg-transparent"
                            )}
                          >
                            <Checkbox
                              id={`mood-${moodOption.slug}`}
                              checked={isChecked}
                              disabled={isDisabled}
                              onCheckedChange={(checkedClient) => {
                                const currentSelectedMoods = field.value ? [...field.value] : [];
                                if (checkedClient) {
                                  if (currentSelectedMoods.length < 3) {
                                    field.onChange([...currentSelectedMoods, moodOption.slug]);
                                  }
                                } else {
                                  field.onChange(currentSelectedMoods.filter((slug) => slug !== moodOption.slug));
                                }
                              }}
                              className="shrink-0"
                            />
                            <span className={cn("font-normal text-sm", isDisabled && "text-muted-foreground")}>
                              {moodOption.emoji} {moodOption.name}
                            </span>
                          </Label>
                        );
                      })}
                    </div>
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
