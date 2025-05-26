
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Smile, Zap, Search, ArrowRight, MapPin, ShoppingCart } from "lucide-react"; // Added MapPin, ShoppingCart
import Link from "next/link";
import Image from "next/image";

export const moodsData = [
  { name: "Chill Vibes", slug: "chill-vibes", description: "Relaxed tunes and calming discussions.", emoji: "😌", bgClass: "bg-blue-100", textClass: "text-blue-700", img: "https://placehold.co/300x200.png?text=Chill" , dataAiHint: "relax meditation" },
  { name: "Focused Work", slug: "focused-work", description: "Productivity boosters and deep work threads.", emoji: "💻", bgClass: "bg-green-100", textClass: "text-green-700", img: "https://placehold.co/300x200.png?text=Focus" , dataAiHint: "work study" },
  { name: "Creative Spark", slug: "creative-spark", description: "Inspiration, art, and innovative ideas.", emoji: "🎨", bgClass: "bg-purple-100", textClass: "text-purple-700", img: "https://placehold.co/300x200.png?text=Creative" , dataAiHint: "art design" },
  { name: "Local Streams", slug: "local-streams", description: "Discover local events, news, and community happenings.", emoji: "🏘️", bgClass: "bg-orange-100", textClass: "text-orange-700", img: "https://placehold.co/300x200.png?text=Local", dataAiHint: "community city" },
  { name: "Shopping Finds", slug: "shopping-finds", description: "Share deals, new products, and shopping tips.", emoji: "🛍️", bgClass: "bg-pink-100", textClass: "text-pink-700", img: "https://placehold.co/300x200.png?text=Shopping", dataAiHint: "retail store" },
  { name: "Weekend Adventure", slug: "weekend-adventure", description: "Plans, tips, and stories about getaways.", emoji: "🏕️", bgClass: "bg-yellow-100", textClass: "text-yellow-700", img: "https://placehold.co/300x200.png?text=Adventure", dataAiHint: "travel nature"  },
  { name: "Tech Talks", slug: "tech-talks", description: "Latest gadgets, coding, and AI discussions.", emoji: "🤖", bgClass: "bg-gray-100", textClass: "text-gray-700", img: "https://placehold.co/300x200.png?text=Tech" , dataAiHint: "technology code"  },
  { name: "Gaming Zone", slug: "gaming-zone", description: "Connect with fellow gamers, share tips & news.", emoji: "🎮", bgClass: "bg-red-100", textClass: "text-red-700", img: "https://placehold.co/300x200.png?text=Gaming" , dataAiHint: "games console" },
];

export default function MoodsPage() {
  return (
    <div className="space-y-8">
      <header className="mb-8 text-center">
        <div className="inline-block p-3 bg-primary/10 rounded-full mb-4">
          <Smile className="h-12 w-12 text-primary" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-foreground font-mono">Mood Streams</h1>
        <p className="text-lg text-muted-foreground mt-2 max-w-2xl mx-auto">
          Discover and subscribe to content streams tailored to your current mood and interests.
        </p>
        <div className="mt-6 max-w-lg mx-auto relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input placeholder="Search moods (e.g., 'Productivity', 'Relax')" className="pl-10 py-3 text-base rounded-full shadow-sm" />
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
              <CardTitle className={`text-xl font-semibold ${mood.textClass}`}>{mood.name}</CardTitle>
              <CardDescription className="text-sm h-12 overflow-hidden text-ellipsis">{mood.description}</CardDescription>
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
          <Zap className="h-10 w-10 text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-foreground mb-3 font-mono">Boost Your Tribe's Content</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Tribe founders can boost relevant threads to Mood Streams, increasing visibility and engagement.
          </p>
          <Button variant="outline" className="border-primary text-primary hover:bg-primary/10">
            Learn More About Boosting
          </Button>
        </Card>
      </section>
    </div>
  );
}
