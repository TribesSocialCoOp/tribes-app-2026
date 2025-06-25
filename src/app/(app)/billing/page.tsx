
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Star, User, Briefcase, HeartHandshake, Building, BarChart, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

const individualTier = {
  name: "Individual Member",
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
        <h1 className="text-4xl font-bold tracking-tight text-foreground font-mono">Pricing & Tiers</h1>
        <p className="text-lg text-muted-foreground mt-2 max-w-3xl mx-auto">
          A simple, fair, and scalable model designed to support our community. From individual builders to large organizations.
        </p>
      </header>

      {/* Individual Membership Section */}
      <section>
        <div className="flex items-center justify-center space-x-3 mb-6">
          <User className="h-8 w-8 text-primary" />
          <h2 className="text-3xl font-semibold tracking-normal text-foreground">Individual Membership</h2>
        </div>
        <Card className="max-w-md mx-auto shadow-lg border-primary ring-2 ring-primary flex flex-col">
           <CardHeader className="pt-6">
              <CardTitle className="text-xl tracking-normal">{individualTier.name}</CardTitle>
              <CardDescription>{individualTier.description}</CardDescription>
              <div className="flex items-baseline pt-2">
                <span className="text-3xl font-bold tracking-tighter">{individualTier.price}</span>
                <span className="text-sm text-muted-foreground ml-1">{individualTier.priceDescription}</span>
              </div>
            </CardHeader>
            <CardContent className="flex-1 space-y-3">
              <ul className="space-y-2 text-sm text-muted-foreground">
                {individualTier.features.map((feature, index) => (
                  <li key={index} className="flex items-start">
                    <Check className="h-4 w-4 text-accent mr-2 mt-0.5 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button className="w-full" variant="default">
                {individualTier.cta}
              </Button>
            </CardFooter>
        </Card>
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
                <h2 className="text-3xl font-semibold tracking-normal text-foreground">Organizational Membership</h2>
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
