
"use client";

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from '@/components/ui/input';
import { uploadFile } from '@/lib/upload';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from "@/components/ui/label";
import { ArrowLeft, Settings as SettingsIcon, Globe, Lock, Tag, Link2, ShieldAlert, Copy, Check, Info, ShieldCheck as ReputationIcon, History, Palette, Trash2, Image as ImageIcon, Move, Upload, Loader2 as Loader } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/use-user';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { getTribeById, getTribeBySlug, updateTribeSettings, checkTribeAccess, deleteTribe, regenerateInviteToken } from '@/lib/actions/tribe-actions';
import type { Tribe } from '@/lib/types';
import { moodsData as allMoodsData } from '@/lib/moods-data';
import { REPUTATION_GATE_OPTIONS, type ReputationStatus } from '@/lib/constants';
import { AuthGuard } from "@/components/providers/auth-guard";

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
  brandColor: z.string().optional(),
  brandLogo: z.string().optional(),
});

type TribeSettingsFormValues = z.infer<typeof tribeSettingsFormSchema>;

export default function TribeSettingsPage() {
  return (
    <AuthGuard message="Sign in to manage your tribe's settings.">
      <TribeSettingsContent />
    </AuthGuard>
  );
}

function TribeSettingsContent() {
  const router = useRouter();
  const params = useParams();
  const slugParam = params.slug as string | undefined;
  const tribeIdParam = params.tribeId as string | undefined;
  const [tribeId, setTribeId] = useState(tribeIdParam || '');
  const { toast } = useToast();
  const { role } = useUser();

  const [tribe, setTribe] = useState<Tribe | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | undefined>(undefined);
  const [isCopied, setIsCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Cover image state
  const [coverUrl, setCoverUrl] = useState<string>('');
  const [coverPosition, setCoverPosition] = useState<string>('center');
  const [isUploading, setIsUploading] = useState(false);
  const [isRepositioning, setIsRepositioning] = useState(false);
  const repositionRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const startPosY = useRef(50);

  useEffect(() => {
    let cancelled = false;

    const resolveAndCheckAccess = async (attempt = 0) => {
      let effectiveId = tribeIdParam || '';
      if (slugParam && !tribeIdParam) {
        const resolved = await getTribeBySlug(slugParam);
        if (!resolved) { router.push('/tribes'); return; }
        effectiveId = resolved.id;
        setTribeId(effectiveId);
      }
      try {
        const accessLevel = await checkTribeAccess(effectiveId);
        // Retry if session hasn't hydrated yet (AuthGuard confirms login)
        if (accessLevel === 'guest' && attempt < 3) {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          if (!cancelled) return resolveAndCheckAccess(attempt + 1);
          return;
        }
        if (cancelled) return;
        const canAccess = accessLevel === 'platform_admin' || accessLevel === 'founder';
        setHasAccess(canAccess);
      } catch {
        if (!cancelled) setHasAccess(false);
      }
    };
    resolveAndCheckAccess();
    return () => { cancelled = true; };
  }, [slugParam, tribeIdParam]);

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
      brandColor: "",
      brandLogo: "",
    },
  });

  useEffect(() => {
    if (tribeId) {
      const fetchTribeData = async () => {
        setIsPageLoading(true);
        const currentTribeData = await getTribeById(tribeId);
        if (currentTribeData) {
          setTribe(currentTribeData);
          setCoverUrl(currentTribeData.cover || '');
          setCoverPosition(currentTribeData.coverPosition || 'center');
          form.reset({
            name: currentTribeData.name,
            description: currentTribeData.description,
            isPublic: currentTribeData.isPublic,
            moods: currentTribeData.moods || [],
            homepageUrl: currentTribeData.homepageUrl || "",
            joinMechanism: currentTribeData.joinMechanism || 'instant',
            minimumReputation: currentTribeData.minimumReputation || "None",
            minimumAccountAgeDays: String(currentTribeData.minimumAccountAgeDays || 0),
            brandColor: currentTribeData.brandColor || "",
            brandLogo: currentTribeData.brandLogo || "",
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
            cover: coverUrl || undefined,
            coverPosition: coverPosition || undefined,
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
    const inviteLink = `${window.location.origin}/invite/${tribe.inviteToken || tribe.id}`;
    navigator.clipboard.writeText(inviteLink);
    setIsCopied(true);
    toast({ title: "Copied!", description: "Invite link copied to clipboard." });
    setTimeout(() => setIsCopied(false), 2000);
  };

  const [isRegenerating, setIsRegenerating] = useState(false);
  const handleRegenerateToken = async () => {
    if (!tribe) return;
    setIsRegenerating(true);
    try {
      const newToken = await regenerateInviteToken(tribeId);
      setTribe({ ...tribe, inviteToken: newToken });
      toast({ title: "Link Regenerated", description: "The old invite link is now invalid." });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to regenerate invite link." });
    } finally {
      setIsRegenerating(false);
    }
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
        <Button variant="outline" size="sm" onClick={() => router.push(`/t/${tribe.slug}`)}>
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
              {/* Cover Image Section */}
              <div className="space-y-3">
                <label className="text-md font-medium leading-none">Cover Image</label>
                <div
                  ref={repositionRef}
                  className="relative h-40 md:h-52 w-full rounded-lg overflow-hidden border bg-muted group cursor-default"
                >
                  {coverUrl ? (
                    <>
                      <Image
                        src={coverUrl}
                        alt="Tribe cover"
                        fill
                        style={{ objectFit: 'cover', objectPosition: coverPosition }}
                        draggable={false}
                        className="select-none"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                      <div className={`absolute top-3 right-3 flex gap-2 z-20 transition-opacity ${isRepositioning ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="bg-white/90 hover:bg-white text-black shadow-md"
                          onClick={() => setIsRepositioning(!isRepositioning)}
                        >
                          <Move className="mr-1.5 h-3.5 w-3.5" />
                          {isRepositioning ? 'Done' : 'Reposition'}
                        </Button>
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-white/90 hover:bg-white text-black shadow-md cursor-pointer">
                          <Upload className="h-3.5 w-3.5" />
                          Replace
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.size > 5 * 1024 * 1024) {
                                toast({ variant: 'destructive', title: 'File too large', description: 'Max file size is 5MB.' });
                                return;
                              }
                              setIsUploading(true);
                              try {
                                const url = await uploadFile(file, 'tribes/covers');
                                setCoverUrl(url);
                                setCoverPosition('center');
                                toast({ title: 'Image uploaded', description: 'Remember to save settings.' });
                              } catch (err) {
                                toast({ variant: 'destructive', title: 'Upload failed', description: (err as Error).message });
                              } finally {
                                setIsUploading(false);
                              }
                            }}
                          />
                        </label>
                      </div>
                      {isRepositioning && (
                        <div
                          className="absolute inset-0 cursor-grab active:cursor-grabbing"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            dragStartY.current = e.clientY;
                            // Parse current Y% from coverPosition
                            const match = coverPosition.match(/(\d+)%\s*$/);
                            startPosY.current = match ? parseInt(match[1]) : 50;
                            const onMove = (ev: MouseEvent) => {
                              const container = repositionRef.current;
                              if (!container) return;
                              const deltaY = ev.clientY - dragStartY.current;
                              const containerH = container.clientHeight;
                              const pctDelta = (deltaY / containerH) * 100;
                              const newY = Math.max(0, Math.min(100, startPosY.current - pctDelta));
                              setCoverPosition(`center ${Math.round(newY)}%`);
                            };
                            const onUp = () => {
                              window.removeEventListener('mousemove', onMove);
                              window.removeEventListener('mouseup', onUp);
                            };
                            window.addEventListener('mousemove', onMove);
                            window.addEventListener('mouseup', onUp);
                          }}
                          onTouchStart={(e) => {
                            const touch = e.touches[0];
                            dragStartY.current = touch.clientY;
                            const match = coverPosition.match(/(\d+)%\s*$/);
                            startPosY.current = match ? parseInt(match[1]) : 50;
                            const onMove = (ev: TouchEvent) => {
                              const container = repositionRef.current;
                              if (!container) return;
                              const deltaY = ev.touches[0].clientY - dragStartY.current;
                              const containerH = container.clientHeight;
                              const pctDelta = (deltaY / containerH) * 100;
                              const newY = Math.max(0, Math.min(100, startPosY.current - pctDelta));
                              setCoverPosition(`center ${Math.round(newY)}%`);
                            };
                            const onUp = () => {
                              window.removeEventListener('touchmove', onMove);
                              window.removeEventListener('touchend', onUp);
                            };
                            window.addEventListener('touchmove', onMove, { passive: true });
                            window.addEventListener('touchend', onUp);
                          }}
                        >
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="bg-black/60 text-white text-sm px-4 py-2 rounded-full font-medium backdrop-blur-sm">
                              <Move className="inline h-4 w-4 mr-1.5 -mt-0.5" />
                              Drag to reposition
                            </div>
                          </div>
                          <div className="absolute inset-x-0 top-0 h-px bg-white/40" />
                          <div className="absolute inset-x-0 bottom-0 h-px bg-white/40" />
                        </div>
                      )}
                      {isUploading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <div className="text-white text-sm font-medium">Uploading...</div>
                        </div>
                      )}
                    </>
                  ) : (
                    <label className="flex flex-col items-center justify-center h-full cursor-pointer hover:bg-muted/80 transition-colors">
                      <ImageIcon className="h-10 w-10 text-muted-foreground mb-2" />
                      <span className="text-sm text-muted-foreground">Click to upload a cover image</span>
                      <span className="text-xs text-muted-foreground mt-1">Max 5MB</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 5 * 1024 * 1024) {
                            toast({ variant: 'destructive', title: 'File too large', description: 'Max file size is 5MB.' });
                            return;
                          }
                          setIsUploading(true);
                          try {
                            const url = await uploadFile(file, 'tribes/covers');
                            setCoverUrl(url);
                            toast({ title: 'Image uploaded', description: 'Remember to save settings.' });
                          } catch (err) {
                            toast({ variant: 'destructive', title: 'Upload failed', description: (err as Error).message });
                          } finally {
                            setIsUploading(false);
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Hover to replace or reposition your cover image. Changes take effect when you save.</p>
              </div>

              <Separator />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-md">Tribe Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your tribe's awesome name" {...field} className="text-base" disabled={(tribe?.members ?? 0) > 1} />
                    </FormControl>
                    <FormDescription>
                      {(tribe?.members ?? 0) > 1
                        ? 'Tribe names are locked once members have joined to protect shared links and community identity.'
                        : 'You can change this while your tribe has no other members. The URL will update automatically.'}
                    </FormDescription>
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
                    <p className="text-sm text-muted-foreground mb-3">Share this secure link to invite users to your tribe. Only one link is active at a time.</p>
                    <div className="flex items-center space-x-2">
                        <Input value={`${typeof window !== 'undefined' ? window.location.origin : ''}/invite/${tribe.inviteToken || '...'}`} readOnly className="text-sm font-mono" />
                        <Button type="button" variant="secondary" onClick={handleCopyLink} size="icon" title="Copy link">
                            {isCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                            <span className="sr-only">{isCopied ? "Copied" : "Copy"}</span>
                        </Button>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                            Regenerating will invalidate the current link.
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleRegenerateToken}
                            disabled={isRegenerating}
                        >
                            {isRegenerating ? <><Loader className="mr-2 h-3 w-3 animate-spin" />Regenerating...</> : 'Regenerate Link'}
                        </Button>
                    </div>
                </div>

                {/* Org Branding — gated behind org_branding feature */}
                {(role === 'Org_Base' || role === 'Org_Pro' || role === 'Org_Enterprise' || role === 'Admin') && (
                  <>
                    <Separator />
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-foreground flex items-center">
                        <Palette className="mr-2 h-5 w-5 text-primary" /> Organization Branding
                      </h3>
                      <p className="text-sm text-muted-foreground">Customize your tribe's appearance with your organization's brand identity.</p>
                      <div className="rounded-lg border p-4 shadow-sm space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="brandColor" className="text-sm font-medium">Brand Color</Label>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              id="brandColor"
                              value={form.watch('brandColor') || '#4F46E5'}
                              onChange={(e) => form.setValue('brandColor', e.target.value)}
                              className="h-10 w-14 rounded border cursor-pointer"
                            />
                            <Input
                              value={form.watch('brandColor') || ''}
                              onChange={(e) => form.setValue('brandColor', e.target.value)}
                              placeholder="#4F46E5"
                              className="font-mono text-sm max-w-[140px]"
                            />
                            <span className="text-xs text-muted-foreground">Accent color for your tribe's pages</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="brandLogo" className="text-sm font-medium">Brand Logo URL</Label>
                          <Input
                            id="brandLogo"
                            value={form.watch('brandLogo') || ''}
                            onChange={(e) => form.setValue('brandLogo', e.target.value)}
                            placeholder="https://your-org.com/logo.png"
                            className="text-sm"
                          />
                          <p className="text-xs text-muted-foreground">URL to your organization's logo (displayed in tribe header)</p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
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

      {/* Danger Zone */}
      <Card className="shadow-xl border-destructive/50">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <Trash2 className="h-6 w-6 text-destructive" />
            <div>
              <CardTitle className="text-xl font-semibold text-destructive tracking-normal">Danger Zone</CardTitle>
              <CardDescription>Irreversible actions for this tribe.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-destructive/30 p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-sm">Delete this tribe</p>
                <p className="text-xs text-muted-foreground">Permanently remove this tribe, all posts, members, and bonds. This cannot be undone.</p>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isDeleting}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Tribe
              </Button>
            </div>

            {showDeleteConfirm && (
              <div className="mt-3 p-4 border border-destructive rounded-md bg-destructive/5 space-y-3">
                <p className="text-sm font-medium text-destructive">Are you absolutely sure?</p>
                <p className="text-xs text-muted-foreground">
                  Type <strong className="text-foreground">{tribe.name}</strong> below to confirm deletion.
                </p>
                <Input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={`Type "${tribe.name}" to confirm`}
                  className="text-sm"
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={deleteConfirmText !== tribe.name || isDeleting}
                    onClick={async () => {
                      setIsDeleting(true);
                      try {
                        await deleteTribe(tribeId);
                        toast({ title: "Tribe Deleted", description: `"${tribe.name}" has been permanently deleted.` });
                        router.push('/tribes');
                      } catch (err) {
                        toast({ variant: "destructive", title: "Delete Failed", description: (err as Error).message });
                      } finally {
                        setIsDeleting(false);
                      }
                    }}
                  >
                    {isDeleting ? "Deleting..." : "I understand, delete this tribe"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
