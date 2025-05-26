
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard } from "lucide-react";

export default function BillingPage() {
  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-foreground font-mono">Billing</h1>
        <p className="text-lg text-muted-foreground mt-1">
          Manage your subscription and payment methods.
        </p>
      </header>

      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <CreditCard className="h-7 w-7 text-primary" />
            <CardTitle className="text-xl">Subscription Details</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">Current Plan: <span className="font-semibold text-foreground">Free Tier</span></p>
          <p className="text-muted-foreground">This page is a placeholder and under construction.</p>
          <p className="text-muted-foreground">Full functionality for billing management will be implemented soon.</p>
          <div className="pt-4">
            <Button variant="default" className="bg-accent text-accent-foreground hover:bg-accent/90 mr-2" disabled>Upgrade to Pro (Coming Soon)</Button>
            <Button variant="outline" disabled>Manage Payment Methods (Coming Soon)</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

    