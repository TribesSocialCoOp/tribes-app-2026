
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ArrowRight, Smile, Megaphone } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { moodsData } from '@/lib/moods-data';

export default function MoodsPage() {
  return (
    <div className="space-y-8">
      <header className="mb-8 text-center">
        <div className="inline-block p-3 bg-primary/10 rounded-full mb-4">
          <Smile className="h-12 w-12 text-primary" />
        </div>
        <h1 className="text-4xl font-bold tracking-normal text-foreground font-mono">Mood Streams</h1>
        <p className="text-lg text-muted-foreground mt-2 max-w-2xl mx-auto">
          Discover and subscribe to content streams tailored to your current mood and interests.
        </p>
        <div className="mt-6 max-w-lg mx-auto relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input placeholder="Search moods (e.g., 'Focus', 'Chill')" className="pl-10 py-3 text-base rounded-full shadow-sm" />
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {moodsData.map((mood) => (
          <Card key={mood.name} className="shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 flex flex-col overflow-hidden">
            <div className="relative h-40 w-full">
              <Image src={mood.img} alt={mood.name} layout="fill" objectFit="cover" data-ai-hint={mood.dataAiHint} />
              <div className={`absolute top-3 right-3 p-2 rounded-full shadow-md ${mood.bgClass}`}>
                <span className="text-2xl">{mood.emoji}</span>
              </div>
            </div>
            <CardHeader className="pt-4">
              <CardTitle className={`text-xl font-semibold tracking-normal ${mood.textClass}`}>{mood.name}</CardTitle>
              <CardDescription className="text-sm">{mood.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow"></CardContent>
            <div className="p-4 border-t">
              <Link href={`/moods/${mood.slug}`} passHref>
                <Button variant="default" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
                  Explore Stream <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </Card>
        ))}
      </section>

      <section className="text-center py-12">
        <Card className="inline-block p-8 shadow-xl bg-gradient-to-r from-primary/10 via-background to-accent/10">
          <Megaphone className="h-10 w-10 text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-foreground mb-3 font-mono tracking-normal">Feature Your Tribe's Content</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Tribe founders can feature relevant threads to Mood Streams, increasing visibility and engagement.
          </p>
          <Button variant="outline" className="border-primary text-primary hover:bg-primary/10">
            Learn More About Featuring
          </Button>
        </Card>
      </section>
    </div>
  );
}
