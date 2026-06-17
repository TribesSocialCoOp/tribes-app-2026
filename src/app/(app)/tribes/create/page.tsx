
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Users, Image as ImageIcon, Globe, Lock, Tag, Link2, ShieldAlert } from "lucide-react";
import Image from "next/image";
import React from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { moodsData as allMoodsData } from '@/lib/moods-data';
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { createTribe } from '@/lib/actions/tribe-actions';
import { uploadFile } from '@/lib/upload';
import { useActionError } from '@/hooks/use-action-error';
import { AuthGuard } from "@/components/providers/auth-guard";

const createTribeFormSchema = z.object({
  name: z.string().min(3, { message: "Tribe name must be at least 3 characters." }).max(50),
  homepageUrl: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal('')),
  moods: z.array(z.string())
    .min(1, { message: "Please select at least one mood." })
    .max(3, { message: "You can select a maximum of 3 moods." }),
  description: z.string().min(10, { message: "Description must be at least 10 characters." }).max(500),
  isPublic: z.boolean().default(true),
  isNsfw: z.boolean().default(false),
  coverImage: z.instanceof(File).optional().refine(file => !file || file.size <= 5 * 1024 * 1024, `Max file size is 5MB.`),
});

type CreateTribeFormValues = z.infer<typeof createTribeFormSchema>;


export default function CreateTribePage() {
  return (
    <AuthGuard message="You need an account to create a new tribe.">
      <CreateTribeContent />
    </AuthGuard>
  );
}

function CreateTribeContent() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);
  const [coverPreview, setCoverPreview] = React.useState<string | null>(null);
  
  const { handleError } = useActionError();
  
  const form = useForm<CreateTribeFormValues>({
    resolver: zodResolver(createTribeFormSchema),
    defaultValues: {
      name: "",
      homepageUrl: "",
      moods: [],
      description: "",
      isPublic: true,
      isNsfw: false,
    },
  });

  // NSFW tribes are permanently Private (policy §3). When NSFW is toggled on, force
  // visibility to Private and lock the visibility switch.
  const isNsfw = form.watch("isNsfw");
  React.useEffect(() => {
    if (isNsfw) form.setValue("isPublic", false);
  }, [isNsfw, form]);

  async function onSubmit(values: CreateTribeFormValues) {
    setIsLoading(true);
    
    try {
      // Upload cover image to S3 if provided.
      // IMPORTANT: never pass a base64 data URI (coverPreview) to the Server Action —
      // it will blow the 1 MB Next.js body limit. Only pass the CDN URL.
      let coverUrl: string | null = null;
      if (values.coverImage) {
        try {
          coverUrl = await uploadFile(values.coverImage, 'tribes/covers');
        } catch (uploadErr: any) {
          toast({ variant: 'destructive', title: 'Image Upload Failed', description: uploadErr.message });
          setIsLoading(false);
          return;
        }
      }

      const { coverImage, ...actionPayload } = values;
      const newTribe = await createTribe({ ...actionPayload, coverPreview: coverUrl });
      if (newTribe && 'serverError' in newTribe) {
        throw newTribe;
      }


      toast({
        title: "Tribe Created!",
        description: `Your new tribe "${values.name}" is now live.`,
      });

      router.push(`/t/${newTribe.slug}`);
    } catch (error) {
       console.error("Failed to create tribe:", error);
       handleError(error, "Creation Failed");
    } finally {
      setIsLoading(false);
    }
  }


  
  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      form.setValue("coverImage", file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setCoverPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      form.setValue("coverImage", undefined);
      setCoverPreview(null);
    }
  };

  const selectedMoodObjects = form.watch('moods').map(slug => allMoodsData.find(m => m.slug === slug)).filter(Boolean);

  return (
    <div className="container mx-auto py-8 px-4 md:px-0 max-w-3xl">
      <Card className="shadow-xl">
        <CardHeader>
          <div className="flex items-center space-x-3 mb-2">
            <Users className="h-8 w-8 text-primary" />
            <CardTitle className="text-2xl sm:text-3xl font-bold font-mono">Create New Tribe</CardTitle>
          </div>
          <CardDescription>
            Establish your community. Define its purpose and invite others to join.
          </CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-lg">Tribe Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Weekend Hikers, AI Innovators" {...field} className="text-base"/>
                    </FormControl>
                    <FormDescription>Choose a catchy and descriptive name for your tribe.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="homepageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-lg flex items-center">
                      <Link2 className="mr-2 h-4 w-4 text-muted-foreground"/> Homepage URL (Optional)
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="https://your-tribe-homepage.com" {...field} className="text-base"/>
                    </FormControl>
                    <FormDescription>An official website for your tribe.</FormDescription>
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
                      <FormLabel className="text-lg flex items-center">
                        <Tag className="mr-2 h-4 w-4 text-muted-foreground"/> Associated Moods
                      </FormLabel>
                      <FormDescription className="mt-1">
                        Select up to 3 moods that best represent your tribe.
                      </FormDescription>
                    </div>
                     {selectedMoodObjects.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {selectedMoodObjects.map(mood => mood && (
                           <Badge key={mood.slug} variant="outline" className={`border-current ${mood.textClass} ${mood.bgClass}/30`}>
                             {mood.emoji} {mood.name}
                           </Badge>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 border rounded-md">
                      {allMoodsData.map((moodOption) => {
                        const isChecked = field.value?.includes(moodOption.slug);
                        const isDisabled = !isChecked && (field.value?.length ?? 0) >= 3;
                        return (
                          <Label
                            key={moodOption.slug}
                            htmlFor={`mood-create-${moodOption.slug}`}
                            className={cn(
                              "flex items-center space-x-2 p-2 border rounded-md hover:bg-muted/50 cursor-pointer transition-colors",
                              isChecked && "bg-accent/70 border-accent",
                              isDisabled && "cursor-not-allowed opacity-60 hover:bg-transparent"
                            )}
                          >
                            <Checkbox
                              id={`mood-create-${moodOption.slug}`}
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
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-lg">Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Tell us more about your tribe's mission, values, and what members can expect."
                        className="resize-none min-h-[120px] text-base"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>A compelling summary to attract new members.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="coverImage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-lg">Cover Image (Optional)</FormLabel>
                    <FormControl>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        {coverPreview ? (
                          <Image src={coverPreview} alt="Cover preview" width={128} height={72} className="rounded-md object-cover h-20 w-32 shrink-0" data-ai-hint="banner group" />
                        ) : (
                          <div className="h-20 w-32 rounded-md bg-muted flex items-center justify-center shrink-0">
                            <ImageIcon className="h-10 w-10 text-muted-foreground" />
                          </div>
                        )}
                        <Input type="file" accept="image/*" onChange={handleImageChange} className="max-w-full sm:max-w-xs"/>
                      </div>
                    </FormControl>
                    <FormDescription>Upload a cover image for your tribe (max 5MB).</FormDescription>
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
                            Public: Discoverable by anyone.
                          </>
                        ) : (
                          <>
                            <Lock className="inline-block mr-1 h-4 w-4 text-red-500" />
                            Private: Invite-only.
                          </>
                        )}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isNsfw}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isNsfw"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-destructive/40 p-4 shadow-sm">
                    <div className="space-y-0.5 pr-4">
                      <FormLabel className="text-base font-semibold">
                        <ShieldAlert className="inline-block mr-1 h-4 w-4 text-destructive" />
                        Adult (18+) Tribe
                      </FormLabel>
                      <FormDescription>
                        Mark this Tribe as NSFW. It will be permanently <strong>Private</strong> and
                        end-to-end encrypted, hidden from feeds and search, and joinable only by
                        age-verified (18+) members. <strong>This cannot be undone.</strong>
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
                {isLoading ? "Creating Tribe..." : "Create Tribe"}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}


    