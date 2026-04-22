
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
import { Label } from "@/components/ui/label";
import { ArrowLeft, Settings as SettingsIcon, Globe, Lock, Tag, Link2, ShieldAlert, Copy, Check, Info, ShieldCheck as ReputationIcon, History } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/use-user';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { getTribeById, updateTribeSettings, checkTribeAccess } from '@/lib/actions/tribe-actions';
import type { Tribe } from '@/lib/types';
import { moodsData as allMoodsData } from '@/lib/moods-data';
import { REPUTATION_GATE_OPTIONS, type ReputationStatus } from '@/lib/constants';

// Use canonical reputation levels from shared constants
const reputationLevels = REPUTATION_GATE_OPTIONS;

const tribeSettingsFormSchema = z.object({
  name: z.string().min(3, { message: "Tribe name must be at least 3 characters." }).max(50),
  description: z.string().min(10, { message: "Description must be at least 10 characters." }).max(500),
  homepageUrl: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal('')),
  isPublic: z.boolean().default(true),
  moods: z.array(z.string())
    .max(3, { message: "You can select a maximum of 3 moods." })
    .optional()
    .default([]),
  joinMechanism: z.enum(['instant', 'approval']).default('instant'),
  minimumReputation: z.string().optional(),
  minimumAccountAgeDays: z.string().optional(),
});

type TribeSettingsFormValues = z.infer<typeof tribeSettingsFormSchema>;

export default function TribeSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const tribeId = params.tribeId as string;
  const { toast } = useToast();
  const { role } = useUser();

  const [tribe, setTribe] = useState<Tribe | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | undefined>(undefined);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    // Determine access via server-side tribe authorization (not global role)
    const resolveAccess = async () => {
      const accessLevel = await checkTribeAccess(tribeId);
      // Only founders and platform admins can access settings
      const canAccess = accessLevel === 'platform_admin' || accessLevel === 'founder';
      setHasAccess(canAccess);
    };
    resolveAccess();
  }, [tribeId]);

  const form = useForm<TribeSettingsFormValues>({
    resolver: zodResolver(tribeSettingsFormSchema),
    defaultValues: {
      name: "",
      description: "",
      homepageUrl: "",
      isPublic: true,
      moods: [],
      joinMechanism: 'instant',
      minimumReputation: "None",
      minimumAccountAgeDays: "0",
    },
  });

  useEffect(() => {
    if (tribeId) {
      const fetchTribeData = async () => {
        setIsPageLoading(true);
        const currentTribeData = await getTribeById(tribeId);
        if (currentTribeData) {
          setTribe(currentTribeData);
          form.reset({
            name: currentTribeData.name,
            description: currentTribeData.description,
            isPublic: currentTribeData.isPublic,
            moods: currentTribeData.moods || [],
            homepageUrl: currentTribeData.homepageUrl || "",
            joinMechanism: currentTribeData.joinMechanism || 'instant',
            minimumReputation: currentTribeData.minimumReputation || "None",
            minimumAccountAgeDays: String(currentTribeData.minimumAccountAgeDays || 0),
          });
        } else {
          router.push('/tribes');
        }
        setIsPageLoading(false);
      };
      fetchTribeData();
    }
  }, [tribeId, form, router]);

  async function onSubmit(values: TribeSettingsFormValues) {
    setIsLoading(true);
    
    const ageDaysValue = values.minimumAccountAgeDays ? parseInt(values.minimumAccountAgeDays, 10) : 0;

    const payload = {
        ...values,
        minimumReputation: values.minimumReputation && reputationLevels.includes(values.minimumReputation as ReputationStatus)
            ? values.minimumReputation as typeof reputationLevels[number]
            : undefined,
        minimumAccountAgeDays: !isNaN(ageDaysValue) && ageDaysValue > 0 ? ageDaysValue : undefined,
    };
    
    try {
        await updateTribeSettings(tribeId, {
            ...payload,
            minimumReputation: payload.minimumReputation as Exclude<typeof reputationLevels[number], 'Onboarding'> | undefined,
        });
        setTribe(prev => prev ? { ...prev, ...payload } : null);
        toast({
            title: "Settings Saved",
            description: `Settings for tribe "${values.name}" have been updated.`,
        });
    } catch (error) {
        console.error("Failed to update tribe settings:", error);
        toast({
            variant: "destructive",
            title: "Update Failed",
            description: "There was an error saving your tribe settings. Please try again."
        });
    } finally {
        setIsLoading(false);
    }
  }

  const handleCopyLink = () => {
    if (!tribe) return;
    const inviteLink = `${window.location.origin}/join?tribe=${tribe.id}`;
    navigator.clipboard.writeText(inviteLink);
    setIsCopied(true);
    toast({ title: "Copied!", description: "Invite link copied to clipboard." });
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (hasAccess === undefined || isPageLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-height,4rem)-2rem)]">
        <p className="text-muted-foreground">Loading tribe settings...</p>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <Card className="max-w-xl mx-auto mt-8 shadow-lg">
        <CardHeader className="text-center">
            <ShieldAlert className="h-16 w-16 text-destructive mx-auto mb-4"/>
            <CardTitle className="text-2xl font-bold">Access Denied</CardTitle>
            <CardDescription>You do not have the required permissions to view this page.</CardDescription>
        </CardHeader>
        <CardFooter className="flex justify-center">
            <Button onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
            </Button>
        </CardFooter>
      </Card>
    );
  }
  
  if (!tribe) {
    // This case is handled by the loading state, but as a fallback
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-height,4rem)-2rem)]">
        <p className="text-muted-foreground">Could not find tribe information.</p>
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
                name="homepageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-md flex items-center">
                      <Link2 className="mr-2 h-4 w-4 text-muted-foreground"/> Homepage URL
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="https://your-tribe-homepage.com" {...field} className="text-base"/>
                    </FormControl>
                    <FormDescription>The official website for your tribe.</FormDescription>
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

              <Separator />

              <div className="space-y-4">
                 <h3 className="text-lg font-semibold text-foreground">Access Control</h3>
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
                <FormField
                  control={form.control}
                  name="joinMechanism"
                  render={({ field }) => (
                    <FormItem className="rounded-lg border p-4 shadow-sm">
                      <FormLabel className="text-base font-semibold">Join Mechanism</FormLabel>
                      <FormDescription className="pb-2">How new members can join this tribe.</FormDescription>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="space-y-2"
                        >
                          <Label className="flex items-center space-x-3 p-3 border rounded-md hover:bg-muted/50 cursor-pointer has-[:checked]:bg-accent/70 has-[:checked]:border-accent">
                            <RadioGroupItem value="instant" id="join-instant" />
                            <div className="flex-1">
                              <p className="font-medium text-sm">Instant Join</p>
                              <p className="text-xs text-muted-foreground">Users can join immediately.</p>
                            </div>
                          </Label>
                          <Label className="flex items-center space-x-3 p-3 border rounded-md hover:bg-muted/50 cursor-pointer has-[:checked]:bg-accent/70 has-[:checked]:border-accent">
                            <RadioGroupItem value="approval" id="join-approval" />
                            <div className="flex-1">
                              <p className="font-medium text-sm">Approval Required</p>
                              <p className="text-xs text-muted-foreground">Admins must approve requests to join.</p>
                            </div>
                          </Label>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                    control={form.control}
                    name="minimumReputation"
                    render={({ field }) => (
                        <FormItem className="rounded-lg border p-4 shadow-sm">
                            <FormLabel className="text-base font-semibold flex items-center">
                                <ReputationIcon className="mr-2 h-4 w-4 text-blue-500" /> Minimum Reputation
                            </FormLabel>
                            <FormDescription className="pb-2">Set a minimum reputation level for new members.</FormDescription>
                            <Select onValueChange={field.onChange} value={field.value || "None"}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a reputation level..." />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="None">None (Open to all)</SelectItem>
                                    <Separator className="my-1" />
                                    {reputationLevels.map(level => (
                                        <SelectItem key={level} value={level}>{level}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                 <FormField
                    control={form.control}
                    name="minimumAccountAgeDays"
                    render={({ field }) => (
                        <FormItem className="rounded-lg border p-4 shadow-sm">
                            <FormLabel className="text-base font-semibold flex items-center">
                                <History className="mr-2 h-4 w-4 text-blue-500" /> Minimum Account Age
                            </FormLabel>
                            <FormDescription className="pb-2">Set a minimum account age for new members to reduce spam.</FormDescription>
                            <Select onValueChange={field.onChange} value={field.value || "0"}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select an age requirement..." />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="0">None</SelectItem>
                                    <Separator className="my-1" />
                                    <SelectItem value="7">7 Days</SelectItem>
                                    <SelectItem value="30">30 Days</SelectItem>
                                    <SelectItem value="90">90 Days</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                 <div className="rounded-lg border p-4 shadow-sm">
                    <h3 className="text-base font-semibold text-foreground mb-1">Invite Link</h3>
                    <p className="text-sm text-muted-foreground mb-3">Share this link to invite users to your tribe. It will respect your chosen join mechanism.</p>
                    <div className="flex items-center space-x-2">
                        <Input value={`${typeof window !== 'undefined' ? window.location.origin : ''}/join?tribe=${tribe.id}`} readOnly className="text-sm" />
                        <Button type="button" variant="secondary" onClick={handleCopyLink} size="icon">
                            {isCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                            <span className="sr-only">{isCopied ? "Copied" : "Copy"}</span>
                        </Button>
                    </div>
                </div>
              </div>

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
