
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Star, User, Briefcase, HeartHandshake, Building, BarChart, Rocket, ShieldCheck, Vote, Annoyed, UserPlus, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

const freeTier = {
    name: "Always Free",
    icon: UserPlus,
    price: "$0",
    priceDescription: "forever",
    description: "Basic access for community participation and secure communication.",
    features: [
        "Join public Tribes",
        "Follow Mood Streams",
        "Form up to 10 personal Bonds",
        "End-to-end encrypted content in your tribes & bonds",
    ],
    cta: "Start with a Free Account",
};

const individualCoopTier = {
  name: "Individual Co-Op Member",
  icon: User,
  price: "$7",
  priceDescription: "/ month",
  description: "For active creators and leaders who want to support and govern the community.",
  features: [
    "Co-Op voting rights on platform decisions",
    "Create and manage public & private Tribes",
    "Host Events for your Tribes",
    "Unlimited personal Bonds",
    "Early access to new features",
  ],
  cta: "Become a Member",
};

const organizationalTiers = [
    {
        name: "Base",
        icon: Building,
        price: "$29",
        priceDescription: "/ month",
        description: "For small creators, vendors, and organizations ready to build.",
        features: [
            "Up to 1,000 members",
            "Includes all Individual Member benefits",
            "Core Creator Toolkit",
            "Direct commerce with 5% transaction fee",
            "Verified organizational profile",
        ],
        cta: "Choose Base Plan",
    },
    {
        name: "Pro",
        icon: BarChart,
        price: "$79",
        priceDescription: "/ month",
        description: "For growing organizations that need more scale and insight.",
        features: [
            "Up to 10,000 members",
            "All Base Tier benefits",
            "Advanced engagement analytics",
            "Priority support",
        ],
        cta: "Choose Pro Plan",
        isPopular: true,
    },
    {
        name: "Enterprise",
        icon: Rocket,
        price: "Contact Us",
        priceDescription: "",
        description: "For large-scale operations with custom needs.",
        features: [
            "Unlimited members",
            "All Pro Tier benefits",
            "Negotiable transaction fees",
            "Dedicated support & API access",
        ],
        cta: "Contact Sales",
    }
];

export default function BillingPage() {
  return (
    <div className="space-y-12 max-w-6xl mx-auto">
      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground font-mono">Join the First Social Media Co-Op</h1>
        <p className="text-lg text-muted-foreground mt-2 max-w-3xl mx-auto">
          We're building a platform owned and governed by its members, not advertisers. Your contribution powers an ad-free, privacy-focused community where you have a real stake.
        </p>
      </header>

      <section>
        <Card className="shadow-lg bg-muted/50">
          <CardHeader>
             <div className="flex items-center space-x-3 mb-2">
                <ShieldCheck className="h-8 w-8 text-primary"/>
                <CardTitle className="text-2xl tracking-normal">A Different Model for Social Media</CardTitle>
             </div>
             <CardDescription>
                On other platforms, you aren't the customer—you are the product. Our mission is to build a sustainable digital public square that serves its community.
             </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-sm">
            <div className="p-4 rounded-lg bg-background border">
                <h3 className="font-semibold flex items-center mb-1"><Annoyed className="h-4 w-4 mr-2 text-destructive"/>No Ads & No Data Selling</h3>
                <p className="text-muted-foreground">Your membership directly funds our platform. We never need to sell your data or fill your feed with ads. Your attention is yours.</p>
            </div>
             <div className="p-4 rounded-lg bg-background border">
                <h3 className="font-semibold flex items-center mb-1"><Vote className="h-4 w-4 mr-2 text-primary"/>Community Governance</h3>
                <p className="text-muted-foreground">As a member, you get a vote on key platform decisions. This is your community, and you help shape its future.</p>
            </div>
             <div className="p-4 rounded-lg bg-background border">
                <h3 className="font-semibold flex items-center mb-1"><Building className="h-4 w-4 mr-2 text-accent"/>Sustainable & Independent</h3>
                <p className="text-muted-foreground">Member support keeps us independent and accountable only to our community, not to venture capitalists or advertisers.</p>
            </div>
             <div className="p-4 rounded-lg bg-background border">
                <h3 className="font-semibold flex items-center mb-1"><Lock className="h-4 w-4 mr-2 text-primary"/>Privacy by Design</h3>
                <p className="text-muted-foreground">Your private content is always end-to-end encrypted. Bonds are your key to this content, giving you secure access to your tribes and personal connections — keeping your content yours.</p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Individual Tiers Section */}
      <section>
        <div className="flex items-center justify-center space-x-3 mb-6">
          <User className="h-8 w-8 text-primary" />
          <h2 className="text-3xl font-semibold tracking-normal text-foreground">Individual Tiers</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Always Free Card */}
            <Card className="shadow-lg flex flex-col">
               <CardHeader className="pt-6">
                  <div className="flex items-center space-x-3 mb-2">
                    <freeTier.icon className="h-8 w-8 text-muted-foreground" />
                    <CardTitle className="text-xl tracking-normal">{freeTier.name}</CardTitle>
                  </div>
                  <CardDescription>{freeTier.description}</CardDescription>
                  <div className="flex items-baseline pt-2">
                    <span className="text-3xl font-bold tracking-tighter">{freeTier.price}</span>
                    <span className="text-sm text-muted-foreground ml-1">{freeTier.priceDescription}</span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 space-y-3">
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {freeTier.features.map((feature, index) => (
                      <li key={index} className="flex items-start">
                        <Check className="h-4 w-4 text-accent mr-2 mt-0.5 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button className="w-full" variant="outline">
                    {freeTier.cta}
                  </Button>
                </CardFooter>
            </Card>

            {/* Individual Co-op Member Card */}
            <Card className="shadow-lg border-primary ring-2 ring-primary flex flex-col">
               <CardHeader className="pt-6">
                  <div className="flex items-center space-x-3 mb-2">
                    <individualCoopTier.icon className="h-8 w-8 text-primary" />
                    <CardTitle className="text-xl tracking-normal">{individualCoopTier.name}</CardTitle>
                  </div>
                  <CardDescription>{individualCoopTier.description}</CardDescription>
                  <div className="flex items-baseline pt-2">
                    <span className="text-3xl font-bold tracking-tighter">{individualCoopTier.price}</span>
                    <span className="text-sm text-muted-foreground ml-1">{individualCoopTier.priceDescription}</span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 space-y-3">
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {individualCoopTier.features.map((feature, index) => (
                      <li key={index} className="flex items-start">
                        <Check className="h-4 w-4 text-accent mr-2 mt-0.5 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button className="w-full" variant="default">
                    {individualCoopTier.cta}
                  </Button>
                </CardFooter>
            </Card>
        </div>
      </section>
      
      {/* Divider */}
      <div className="relative">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-border"></div>
          </div>
          <div className="relative flex justify-center">
              <span className="bg-background px-2 text-sm text-muted-foreground">
                  <Briefcase className="h-5 w-5"/>
              </span>
          </div>
      </div>

      {/* Organizational Membership Section */}
      <section>
        <div className="text-center">
            <div className="flex items-center justify-center space-x-3 mb-2">
                <Briefcase className="h-8 w-8 text-sky-600" />
                <h2 className="text-3xl font-semibold tracking-normal text-foreground">Organizational Co-Op Membership</h2>
            </div>
            <p className="text-md text-muted-foreground mt-1 max-w-2xl mx-auto">
                For businesses, brands, artists, and non-profits. All plans include full Co-Op membership with voting rights, plus professional tools for community engagement and commerce.
            </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
            {organizationalTiers.map((tier) => (
              <Card key={tier.name} className={cn("flex flex-col shadow-lg transition-all", tier.isPopular ? "border-primary ring-2 ring-primary" : "")}>
                {tier.isPopular && (
                  <div className="py-1 px-3 bg-primary text-primary-foreground text-xs font-semibold rounded-t-lg flex items-center justify-center">
                    <Star className="mr-1.5 h-4 w-4" /> Most Popular
                  </div>
                )}
                <CardHeader className="pt-6">
                  <div className="flex items-center space-x-3 mb-2">
                    <tier.icon className="h-8 w-8 text-sky-600" />
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
                  <Button className="w-full" variant={tier.isPopular ? "default" : "outline"}>
                    {tier.cta}
                  </Button>
                </CardFooter>
              </Card>
            ))}
        </div>
      </section>

      {/* Mission-Driven Discount Section */}
      <section className="pt-8">
        <Card className="bg-muted/50 border-dashed shadow-md">
            <CardHeader className="flex-col sm:flex-row items-center gap-4">
                 <HeartHandshake className="h-12 w-12 text-pink-500 shrink-0"/>
                 <div className="text-center sm:text-left">
                    <CardTitle className="text-xl tracking-normal">Community Builder Discount</CardTitle>
                    <CardDescription className="mt-1">
                        We offer a 25% discount on monthly fees for registered non-profits and other verifiable mission-driven organizations.
                    </CardDescription>
                 </div>
            </CardHeader>
            <CardFooter className="justify-center sm:justify-start">
                 <Button variant="link">Learn More & Apply</Button>
            </CardFooter>
        </Card>
      </section>
    </div>
  );
}
