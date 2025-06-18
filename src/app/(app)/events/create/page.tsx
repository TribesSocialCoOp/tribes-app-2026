
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon, Image as ImageIcon, Globe, Lock, Sparkles, CalendarPlus, MapPin, Lightbulb } from "lucide-react";
import { generateEventDescription } from "@/ai/flows/event-description-generator";
import { generateEventKeywords } from "@/ai/flows/generate-event-keywords"; // New import
import { useToast } from "@/hooks/use-toast";


const eventCreateFormSchema = z.object({
  name: z.string().min(3, { message: "Event name must be at least 3 characters." }).max(100, { message: "Event name must not exceed 100 characters." }),
  keywords: z.string().min(3, { message: "Please provide some keywords for your event (e.g., Live Music, Tech Workshop)."}),
  description: z.string().min(10, { message: "Description must be at least 10 characters." }).max(1000, { message: "Description must not exceed 1000 characters." }),
  eventDate: z.date({ required_error: "An event date is required." }),
  associatedTribe: z.string().min(1, { message: "Associated tribe is required."}),
  locationName: z.string().min(1, {message: "Please provide a venue name or general location (e.g., Downtown Park, Online)."}),
  locationCityRegion: z.string().min(1, {message: "Please provide the city and region (e.g., San Francisco, CA)."}),
  coverImage: z.instanceof(File).optional().refine(file => !file || file.size <= 5 * 1024 * 1024, `Max file size is 5MB.`),
  isPublic: z.boolean().default(true),
});

type EventCreateFormValues = z.infer<typeof eventCreateFormSchema>;

export default function CreateEventPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);
  const [isAiGeneratingDesc, setIsAiGeneratingDesc] = React.useState(false);
  const [isAiSuggestingKeywords, setIsAiSuggestingKeywords] = React.useState(false); // New state
  const [coverPreview, setCoverPreview] = React.useState<string | null>(null);

  const form = useForm<EventCreateFormValues>({
    resolver: zodResolver(eventCreateFormSchema),
    defaultValues: {
      name: "",
      keywords: "",
      description: "",
      associatedTribe: "",
      locationName: "",
      locationCityRegion: "",
      isPublic: true,
    },
  });

  async function onSubmit(values: EventCreateFormValues) {
    setIsLoading(true);
    console.log("Event Creation Submitted:", values);
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsLoading(false);
    toast({
      title: "Event Created (Simulated!)",
      description: `Your event "${values.name}" has been successfully created.`,
    });
    form.reset();
    setCoverPreview(null);
    // router.push('/events');
  }

  async function handleGenerateDescription() {
    const eventName = form.getValues("name");
    const keywords = form.getValues("keywords");
    const locationName = form.getValues("locationName");
    const locationCityRegion = form.getValues("locationCityRegion");

    let hasError = false;
    if (!eventName) {
      form.setError("name", { type: "manual", message: "Please enter an event name first." });
      hasError = true;
    }
    if (!keywords) {
      form.setError("keywords", { type: "manual", message: "Please enter keywords to help generate a description." });
      hasError = true;
    }
    if (!locationName) {
      form.setError("locationName", {type: "manual", message: "Please provide a location name for better context."});
      hasError = true;
    }
     if (!locationCityRegion) {
      form.setError("locationCityRegion", {type: "manual", message: "Please provide a city/region for better context."});
      hasError = true;
    }

    if (hasError) return;

    setIsAiGeneratingDesc(true);
    try {
      const result = await generateEventDescription({
        name: eventName,
        keywords,
        locationName,
        locationCityRegion
      });
      form.setValue("description", result.description);
      form.clearErrors("description");
    } catch (error) {
      console.error("Failed to generate event description:", error);
      form.setError("description", { type: "manual", message: "AI failed to generate description. Please try again." });
    }
    setIsAiGeneratingDesc(false);
  }

  async function handleSuggestKeywords() {
    const eventName = form.getValues("name");
    const eventDescription = form.getValues("description");

    let hasError = false;
    if (!eventName) {
      form.setError("name", { type: "manual", message: "Please enter an event name to suggest keywords." });
      hasError = true;
    }
    if (!eventDescription) {
      form.setError("description", { type: "manual", message: "Please enter an event description to suggest keywords." });
      hasError = true;
    }
    if (hasError) {
        toast({
            variant: "destructive",
            title: "Missing Information",
            description: "Please provide an event name and description before suggesting keywords.",
        });
        return;
    }

    setIsAiSuggestingKeywords(true);
    try {
      const result = await generateEventKeywords({ eventName, eventDescription });
      const currentKeywords = form.getValues("keywords").split(',').map(k => k.trim()).filter(k => k);
      const newKeywords = result.suggestedKeywords;

      const combinedKeywords = new Set([...currentKeywords, ...newKeywords]);
      const uniqueKeywordsString = Array.from(combinedKeywords).join(', ');

      form.setValue("keywords", uniqueKeywordsString);
      form.clearErrors("keywords");
      toast({
        title: "Keywords Suggested",
        description: "AI has added new keyword suggestions.",
      });
    } catch (error) {
      console.error("Failed to suggest event keywords:", error);
      toast({
        variant: "destructive",
        title: "AI Error",
        description: "Failed to suggest keywords. Please try again or enter them manually.",
      });
    }
    setIsAiSuggestingKeywords(false);
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


  return (
    <div className="container mx-auto py-8 px-4 md:px-0 max-w-3xl">
      <Card className="shadow-xl">
        <CardHeader>
          <div className="flex items-center space-x-3 mb-2">
            <CalendarPlus className="h-8 w-8 text-primary" />
            <CardTitle className="text-3xl font-bold font-mono">Create New Event</CardTitle>
          </div>
          <CardDescription>
            Organize your event, set the details, and prepare to connect with attendees.
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
                    <FormLabel className="text-lg">Event Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Summer Music Festival, Tech Innovators Summit" {...field} className="text-base"/>
                    </FormControl>
                    <FormDescription>The official title of your event.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="keywords"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-lg">Event Keywords</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Live Music, Networking, Technology, Art Show" {...field} className="text-base" />
                    </FormControl>
                    <Button type="button" variant="outline" size="sm" onClick={handleSuggestKeywords} disabled={isAiSuggestingKeywords || isLoading || isAiGeneratingDesc} className="mt-2">
                        <Lightbulb className="mr-2 h-4 w-4" /> {isAiSuggestingKeywords ? "Suggesting..." : "Suggest with AI"}
                    </Button>
                    <FormDescription>Comma-separated keywords that describe your event. Used for AI description and discovery.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="locationName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-lg flex items-center"><MapPin className="h-4 w-4 mr-2 text-muted-foreground"/>Venue/Location</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., The Grand Ballroom, Online" {...field} className="text-base"/>
                      </FormControl>
                      <FormDescription>Name of the venue or type of location.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="locationCityRegion"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-lg">City/Region</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., San Francisco, CA" {...field} className="text-base"/>
                      </FormControl>
                      <FormDescription>City and State/Region of the event.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>


              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-lg">Event Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Provide a detailed description of your event, what attendees can expect, highlights, etc."
                        className="resize-none min-h-[120px] text-base"
                        {...field}
                      />
                    </FormControl>
                     <Button type="button" variant="outline" size="sm" onClick={handleGenerateDescription} disabled={isAiGeneratingDesc || isLoading || isAiSuggestingKeywords} className="mt-2">
                        <Sparkles className="mr-2 h-4 w-4" /> {isAiGeneratingDesc ? "Generating..." : "Generate with AI"}
                    </Button>
                    <FormDescription>A compelling summary to attract attendees.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="eventDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="text-lg">Event Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal text-base",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date < new Date(new Date().setHours(0,0,0,0))
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>
                      When is your event taking place?
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

               <FormField
                control={form.control}
                name="associatedTribe"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-lg">Organizing Tribe</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter the name of the organizing tribe" {...field} className="text-base"/>
                    </FormControl>
                    <FormDescription>Which tribe is hosting this event? (Note: In the future, this will be a selection of your managed tribes).</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />


              <FormField
                control={form.control}
                name="coverImage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-lg">Event Cover Image (Optional)</FormLabel>
                    <FormControl>
                      <div className="flex items-center space-x-4">
                        {coverPreview ? (
                          <Image src={coverPreview} alt="Cover preview" width={128} height={72} className="rounded-md object-cover h-20 w-32 border" data-ai-hint="event banner" />
                        ) : (
                          <div className="h-20 w-32 rounded-md bg-muted flex items-center justify-center border">
                            <ImageIcon className="h-10 w-10 text-muted-foreground" />
                          </div>
                        )}
                        <Input type="file" accept="image/*" onChange={handleImageChange} className="max-w-xs"/>
                      </div>
                    </FormControl>
                    <FormDescription>Upload a cover image for your event (max 5MB).</FormDescription>
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
                        Event Visibility
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
                            Private: Only users with a direct link or invite can see this event.
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
              <Button type="submit" disabled={isLoading || isAiGeneratingDesc || isAiSuggestingKeywords} className="w-full md:w-auto bg-primary hover:bg-primary/90 text-lg py-3 px-6">
                {isLoading ? "Creating Event..." : "Create Event"}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
