
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Users, Briefcase, Star } from "lucide-react";
import { cn } from "@/lib/utils";

const tiers = [
  {
    name: "Free User",
    title: "Community Participant",
    price: "$0",
    priceDescription: "/ month",
    description: "The foundational level for everyone on the platform.",
    features: [
      "Create limited personal Bonds",
      "Join any public Tribe",
      "Be invited to private Tribes",
      "Participate in Events",
      "Consume and interact with Mood streams",
    ],
    isCurrent: true,
    cta: "Your Current Plan",
  },
  {
    name: "Individual Member",
    title: "Community Builder",
    price: "$10",
    priceDescription: "/ month",
    description: "For active creators and leaders in the community.",
    features: [
      "Includes all Free User benefits",
      "Create and manage public & private Tribes",
      "Host Events for your Tribes",
      "Unlimited personal Bonds",
      "Co-Op voting rights on platform decisions",
      "Early access to new features",
    ],
    isCurrent: false,
    cta: "Upgrade to Member",
    isPopular: true,
  },
  {
    name: "Organizational Member",
    title: "Creator & Brand",
    price: "Contact Us",
    priceDescription: "",
    description: "A dedicated toolkit for professional community engagement.",
    features: [
      "Includes all Individual Member benefits",
      "Verified organizational profile",
      "Guaranteed access to the 'Shop' mood stream",
      "Direct commerce tools (merch, tickets)",
      "Issue verifiable digital Bonds (e.g., VIP passes)",
      "Privacy-respecting engagement analytics",
    ],
    isCurrent: false,
    cta: "Contact Sales",
  },
];

export default function BillingPage() {
  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground font-mono">Our Social Co-Op Model</h1>
        <p className="text-lg text-muted-foreground mt-2 max-w-2xl mx-auto">
          Choose a tier that fits your needs. From community participation to professional creation, we have a plan for you.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {tiers.map((tier) => (
          <Card key={tier.name} className={cn("flex flex-col shadow-lg transition-all", tier.isPopular ? "border-primary ring-2 ring-primary" : "")}>
            {tier.isPopular && (
              <div className="py-1 px-3 bg-primary text-primary-foreground text-xs font-semibold rounded-t-lg flex items-center justify-center">
                <Star className="mr-1.5 h-4 w-4" /> Most Popular
              </div>
            )}
            <CardHeader className="pt-6">
              <div className="flex items-center space-x-3 mb-2">
                 {tier.name === "Free User" && <Users className="h-8 w-8 text-muted-foreground" />}
                 {tier.name === "Individual Member" && <Star className="h-8 w-8 text-primary" />}
                 {tier.name === "Organizational Member" && <Briefcase className="h-8 w-8 text-sky-600" />}
                <CardTitle className="text-xl tracking-normal">{tier.name}</CardTitle>
              </div>
              <CardDescription>{tier.description}</CardDescription>
              <div className="flex items-baseline pt-2">
                <span className="text-3xl font-bold tracking-tighter">{tier.price}</span>
                {tier.priceDescription && <span className="text-sm text-muted-foreground ml-1">{tier.priceDescription}</span>}
              </div>
            </CardHeader>
            <CardContent className="flex-1 space-y-3">
              <ul className="space-y-2 text-sm text-muted-foreground">
                {tier.features.map((feature, index) => (
                  <li key={index} className="flex items-start">
                    <Check className="h-4 w-4 text-accent mr-2 mt-0.5 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button disabled={tier.isCurrent} className="w-full" variant={tier.isPopular ? "default" : "outline"}>
                {tier.cta}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
