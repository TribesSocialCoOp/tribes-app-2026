
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
import { Users, Image as ImageIcon, Globe, Lock, Sparkles } from "lucide-react";
import Image from "next/image";
import { generateTribeDescription } from "@/ai/flows/tribe-description-generator";
import React from "react";

const createTribeFormSchema = z.object({
  name: z.string().min(3, { message: "Tribe name must be at least 3 characters." }).max(50),
  moods: z.string().min(3, { message: "Please provide some moods for your tribe (e.g., Chill, Productive)."}),
  description: z.string().min(10, { message: "Description must be at least 10 characters." }).max(500),
  isPublic: z.boolean().default(true),
  coverImage: z.instanceof(File).optional().refine(file => !file || file.size <= 5 * 1024 * 1024, `Max file size is 5MB.`),
});

type CreateTribeFormValues = z.infer<typeof createTribeFormSchema>;

export default function CreateTribePage() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [coverPreview, setCoverPreview] = React.useState<string | null>(null);
  
  const form = useForm<CreateTribeFormValues>({
    resolver: zodResolver(createTribeFormSchema),
    defaultValues: {
      name: "",
      moods: "",
      description: "",
      isPublic: true,
    },
  });

  async function onSubmit(values: CreateTribeFormValues) {
    setIsLoading(true);
    console.log(values);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsLoading(false);
    // Handle actual submission, e.g., redirect or show success message
    alert("Tribe created (simulated): " + values.name);
    form.reset();
    setCoverPreview(null);
  }

  async function handleGenerateDescription() {
    const moods = form.getValues("moods");
    if (!moods) {
      form.setError("moods", { type: "manual", message: "Please enter moods to generate a description." });
      return;
    }
    setIsLoading(true);
    try {
      const result = await generateTribeDescription({ moods }); // Pass moods to the AI flow
      form.setValue("description", result.description);
    } catch (error) {
      console.error("Failed to generate description:", error);
      form.setError("description", { type: "manual", message: "AI failed to generate description. Please try again." });
    }
    setIsLoading(false);
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
    }
  };


  return (
    <div className="container mx-auto py-8 px-4 md:px-0 max-w-3xl">
      <Card className="shadow-xl">
        <CardHeader>
          <div className="flex items-center space-x-3 mb-2">
            <Users className="h-8 w-8 text-primary" />
            <CardTitle className="text-3xl font-bold font-mono">Create New Tribe</CardTitle>
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
                name="moods"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-lg">Associated Moods</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Chill Vibes, Focused Work, Creative Spark" {...field} className="text-base" />
                    </FormControl>
                    <FormDescription>Comma-separated moods that describe your tribe. Used for discovery and AI suggestions.</FormDescription>
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
                     <Button type="button" variant="outline" size="sm" onClick={handleGenerateDescription} disabled={isLoading} className="mt-2">
                        <Sparkles className="mr-2 h-4 w-4" /> {isLoading ? "Generating..." : "Generate with AI"}
                    </Button>
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
                      <div className="flex items-center space-x-4">
                        {coverPreview ? (
                          <Image src={coverPreview} alt="Cover preview" width={128} height={72} className="rounded-md object-cover h-20 w-32" data-ai-hint="banner group" />
                        ) : (
                          <div className="h-20 w-32 rounded-md bg-muted flex items-center justify-center">
                            <ImageIcon className="h-10 w-10 text-muted-foreground" />
                          </div>
                        )}
                        <Input type="file" accept="image/*" onChange={handleImageChange} className="max-w-xs"/>
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

    