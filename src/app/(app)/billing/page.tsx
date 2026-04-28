
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Check, Star, User, Briefcase, HeartHandshake, Building, BarChart, Rocket, ShieldCheck, Vote, Annoyed, UserPlus, Lock, Gift, Loader2, Sparkles, Crown, TrendingUp, Copy, Trash2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { validateInviteCode, redeemInviteCode, createCheckoutSession, getMySubscription, getContributionSummary, getMyInviteCodes, revokeInviteCode, getAllInviteCodes, createFoundingCode } from '@/lib/actions/profile-actions';
import { useActionError } from '@/hooks/use-action-error';

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
  yearlyPrice: "$70",
  yearlyDescription: "/ year (save 17%)",
  planId: "individual_coop",
  description: "For active creators and leaders who want to support and govern the community.",
  features: [
    "Co-Op voting rights on platform decisions",
    "Create and manage up to 5 Tribes",
    "Host Events for your Tribes",
    "Unlimited personal Bonds",
    "Early access to new features",
  ],
  cta: "Become a Member",
};

const creatorTier = {
  name: "Creator",
  icon: Sparkles,
  price: "$14",
  priceDescription: "/ month",
  yearlyPrice: "$140",
  yearlyDescription: "/ year (save 17%)",
  planId: "creator",
  description: "For power users who create content and run multiple tribes.",
  features: [
    "Everything in Individual Co-Op",
    "Create and manage up to 15 Tribes",
    "Family Bonds & Vault Backup",
    "Creator analytics dashboard",
    "Reserved alias priority",
  ],
  cta: "Go Creator",
};

const organizationalTiers = [
    {
        name: "Base",
        icon: Building,
        price: "$49",
        priceDescription: "/ month",
        planId: "org_base",
        description: "For small creators, vendors, and organizations ready to build.",
        features: [
            "Up to 1,000 members",
            "Includes all Creator benefits",
            "Core Creator Toolkit",
            "Direct commerce with 5% transaction fee",
            "Verified organizational profile",
        ],
        cta: "Choose Base Plan",
    },
    {
        name: "Pro",
        icon: BarChart,
        price: "$99",
        priceDescription: "/ month",
        planId: "org_pro",
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
        planId: "org_enterprise",
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
  const { toast } = useToast();
  const { user, role, isLoading: isUserLoading } = useUser();
  const isAdmin = role === 'Admin';
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<{ valid: boolean; planName?: string } | null>(null);
  const [subscription, setSubscription] = useState<Awaited<ReturnType<typeof getMySubscription>> | null>(null);
  const [contribSummary, setContribSummary] = useState<Awaited<ReturnType<typeof getContributionSummary>> | null>(null);
  const [inviteCodes, setInviteCodes] = useState<Awaited<ReturnType<typeof getMyInviteCodes>>>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [adminCodes, setAdminCodes] = useState<Awaited<ReturnType<typeof getAllInviteCodes>>>([]);
  const [isCreatingFoundingCode, setIsCreatingFoundingCode] = useState(false);

  const { handleError } = useActionError();

  useEffect(() => {
    if (user) {
      getMySubscription().then(setSubscription).catch(() => {});
      getContributionSummary().then(setContribSummary).catch(() => {});
      getMyInviteCodes().then(setInviteCodes).catch(() => {});
      if (isAdmin) {
        getAllInviteCodes().then(setAdminCodes).catch(() => {});
      }
    }
  }, [user, isAdmin]);

  const handleCheckout = async (planId: string, interval: 'monthly' | 'yearly' = 'monthly') => {
    if (!user) {
      toast({ title: "Please log in", description: "You need an account to subscribe.", variant: "destructive" });
      return;
    }
    setLoadingPlan(`${planId}-${interval}`);
    try {
      const result = await createCheckoutSession(planId, interval);
      window.location.href = result.url;
    } catch (err: unknown) {
      handleError(err, "Checkout Error");
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleValidateCode = async () => {
    if (!inviteCode.trim()) return;
    try {
      const result = await validateInviteCode(inviteCode);
      setInviteStatus({ valid: true, planName: result.planName });
      toast({ title: "Code Valid!", description: `This code grants ${result.planName} membership.` });
    } catch (err: unknown) {
      setInviteStatus({ valid: false });
      handleError(err, "Invalid Code");
    }
  };

  const handleRedeemCode = async () => {
    if (!user) {
      toast({ title: "Please log in", description: "You need an account to redeem a code.", variant: "destructive" });
      return;
    }
    setIsRedeeming(true);
    try {
      const result = await redeemInviteCode(inviteCode);
      toast({ title: "🎉 Welcome, Founding Member!", description: `You now have ${result.planName} access.` });
      setInviteCode("");
      setInviteStatus(null);
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: unknown) {
      handleError(err, "Redemption Failed");
    } finally {
      setIsRedeeming(false);
    }
  };

  const hasActiveSub = subscription?.subscription?.status === 'active';
  const currentPlanName = subscription?.plan?.name ?? 'Always Free';
  const subSource = subscription?.subscription?.source;
  const currentPlanId = subscription?.subscription?.planId;

  // Find the tier features for the current plan
  const currentTierFeatures = currentPlanId === 'individual_coop'
    ? individualCoopTier.features
    : currentPlanId === 'creator'
    ? creatorTier.features
    : organizationalTiers.find(t => t.planId === currentPlanId)?.features ?? [];

  // ──────────────────────────── MEMBER VIEW ────────────────────────────
  if (hasActiveSub && user) {
    return (
      <div className="space-y-10 max-w-4xl mx-auto">
        <header className="text-center">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground font-mono">Your Membership</h1>
          <p className="text-lg text-muted-foreground mt-2">
            Manage your Co-Op membership, share invite codes, and explore upgrade options.
          </p>
        </header>

        {/* Current Plan Card */}
        <Card className="shadow-lg border-emerald-500/50 bg-gradient-to-r from-emerald-50/50 to-background dark:from-emerald-950/20 dark:to-background">
          <CardHeader>
            <div className="flex items-center space-x-3">
              <Crown className="h-8 w-8 text-emerald-500" />
              <div>
                <CardTitle className="text-xl tracking-normal flex items-center gap-2">
                  {currentPlanName}
                  {subSource && (
                    <Badge variant={subSource === 'founding' ? 'default' : subSource === 'earned' ? 'secondary' : 'outline'}
                           className={cn(
                             subSource === 'founding' && 'bg-amber-500 hover:bg-amber-600',
                             subSource === 'earned' && 'bg-emerald-500 hover:bg-emerald-600'
                           )}>
                      {subSource === 'founding' ? '✨ Founding Member' : subSource === 'earned' ? '🏆 Earned' : '💳 Paid'}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="mt-1">
                  {subSource === 'founding'
                    ? 'You joined as a Founding Member. Your early support is what makes this platform possible.'
                    : subSource === 'earned'
                    ? 'You earned your membership through community contributions. Earned memberships renew monthly based on your activity.'
                    : 'Your membership powers the co-op. Thank you for supporting an ad-free, member-owned platform.'
                  }
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Plan Benefits */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Your Benefits</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {currentTierFeatures.map((feature, index) => {
                    // Mark voting as excluded for earned members
                    const isVoting = feature.toLowerCase().includes('voting');
                    const isExcluded = isVoting && subSource === 'earned';
                    return (
                      <li key={index} className={cn('flex items-start', isExcluded && 'opacity-50')}>
                        {isExcluded ? (
                          <Lock className="h-4 w-4 text-muted-foreground mr-2 mt-0.5 shrink-0" />
                        ) : (
                          <Check className="h-4 w-4 text-emerald-500 mr-2 mt-0.5 shrink-0" />
                        )}
                        <span>
                          {feature}
                          {isExcluded && <span className="text-xs ml-1">(paid members only)</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Account Details */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Account Details</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Status</dt>
                    <dd className="font-medium text-emerald-600">Active</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Source</dt>
                    <dd className="font-medium capitalize">{subSource ?? 'N/A'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Plan</dt>
                    <dd className="font-medium">{currentPlanName}</dd>
                  </div>
                  {subSource === 'earned' && contribSummary?.daysUntilReset !== null && contribSummary?.daysUntilReset !== undefined && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Renews in</dt>
                      <dd className={cn('font-medium', contribSummary.daysUntilReset <= 7 ? 'text-amber-600' : 'text-foreground')}>
                        {contribSummary.daysUntilReset} days
                        {contribSummary.daysUntilReset <= 7 && ' ⚠️'}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          </CardContent>
          <CardFooter className="border-t pt-6">
            {subSource === 'paid' && (
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const { createBillingPortalSession } = await import('@/lib/services/payment-service');
                    const session = await createBillingPortalSession(user.id);
                    window.location.href = session.url;
                  } catch (e) {
                    toast({ title: "Error", description: "Could not open billing portal.", variant: "destructive" });
                  }
                }}
              >
                Manage Subscription
              </Button>
            )}
            {subSource === 'founding' && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full">
                <p className="text-sm text-muted-foreground flex-1">
                  ✨ As a Founding Member, your membership is complimentary. No payment required.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={loadingPlan === `${individualCoopTier.planId}-monthly`}
                  onClick={() => handleCheckout(individualCoopTier.planId, 'monthly')}
                >
                  {loadingPlan === `${individualCoopTier.planId}-monthly` && <Loader2 className="h-3 w-3 animate-spin mr-2" />}
                  Support the Co-Op — $7/mo
                </Button>
              </div>
            )}
            {subSource === 'earned' && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full">
                <div className="flex-1 space-y-1">
                  <p className="text-sm text-muted-foreground">
                    🏆 Earned through contributions. Keep posting, commenting, and vibing to maintain your status!
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Upgrade to a paid plan for voting rights and permanent membership.
                  </p>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  className="shrink-0"
                  disabled={loadingPlan === `${individualCoopTier.planId}-monthly`}
                  onClick={() => handleCheckout(individualCoopTier.planId, 'monthly')}
                >
                  {loadingPlan === `${individualCoopTier.planId}-monthly` && <Loader2 className="h-3 w-3 animate-spin mr-2" />}
                  <Vote className="h-4 w-4 mr-1" /> Unlock Voting — $7/mo
                </Button>
              </div>
            )}
          </CardFooter>
        </Card>

        {/* Invite Friends */}
        <Card className="shadow-lg">
          <CardHeader>
            <div className="flex items-center space-x-3">
              <Gift className="h-7 w-7 text-amber-500" />
              <div>
                <CardTitle className="text-lg tracking-normal">Invite Friends</CardTitle>
                <CardDescription>
                  Share personal invite codes with friends. When they join, you earn 25 referral points and a mutual bond is created.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Code List */}
            {inviteCodes.length > 0 && (
              <div className="space-y-2">
                {inviteCodes.map((code) => {
                  const isExhausted = (code.usedCount ?? 0) >= (code.maxUses ?? 1);
                  const remaining = (code.maxUses ?? 1) - (code.usedCount ?? 0);
                  return (
                    <div
                      key={code.id}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border",
                        isExhausted ? "opacity-50 bg-muted/30" : "bg-muted/10"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <code className="text-sm font-mono font-semibold tracking-wide shrink-0">
                          {code.id}
                        </code>
                        <Badge variant={isExhausted ? "secondary" : "outline"} className="shrink-0 text-xs">
                          {isExhausted ? "Exhausted" : `${code.usedCount ?? 0}/${code.maxUses ?? 1} used`}
                        </Badge>
                        {!isExhausted && remaining <= 1 && (
                          <span className="text-xs text-amber-500 font-medium">{remaining} left</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!isExhausted && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Copy code"
                            onClick={() => {
                              navigator.clipboard.writeText(code.id);
                              toast({ title: "Copied!", description: `${code.id} copied to clipboard.` });
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {!isExhausted && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive/60 hover:text-destructive"
                            title="Revoke code"
                            onClick={async () => {
                              try {
                                await revokeInviteCode(code.id);
                                setInviteCodes(prev => prev.map(c =>
                                  c.id === code.id ? { ...c, maxUses: c.usedCount ?? 0 } : c
                                ));
                                toast({ title: "Revoked", description: `${code.id} can no longer be used.` });
                              } catch {
                                toast({ variant: "destructive", title: "Error", description: "Failed to revoke code." });
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Generate Button */}
            <Button
              variant="outline"
              className="font-mono"
              disabled={isGenerating}
              onClick={async () => {
                setIsGenerating(true);
                try {
                  const { generateInviteCode } = await import('@/lib/actions/profile-actions');
                  const result = await generateInviteCode();
                  navigator.clipboard.writeText(result.code);
                  toast({ title: "Code Generated!", description: `${result.code} — copied to clipboard!` });
                  // Refresh the list
                  getMyInviteCodes().then(setInviteCodes).catch(() => {});
                } catch (e: unknown) {
                  toast({ title: "Error", description: ((e instanceof Error) ? e.message : 'An error occurred'), variant: "destructive" });
                } finally {
                  setIsGenerating(false);
                }
              }}
            >
              {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
              Generate Invite Code
            </Button>
            <p className="text-xs text-muted-foreground">
              Each code allows up to 5 signups. You can have up to 3 active codes at a time.
            </p>
          </CardContent>
        </Card>

        {/* Admin: System Invite Codes */}
        {isAdmin && (
          <Card className="shadow-lg border-amber-500/30">
            <CardHeader>
              <div className="flex items-center space-x-3">
                <ShieldCheck className="h-7 w-7 text-amber-500" />
                <div>
                  <CardTitle className="text-lg tracking-normal">System Invite Codes</CardTitle>
                  <CardDescription>
                    Admin view of all invite codes. Create founding codes that grant Co-Op membership.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* All system codes */}
              {adminCodes.length > 0 && (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {adminCodes.map((code) => {
                    const isExhausted = (code.usedCount ?? 0) >= (code.maxUses ?? 1);
                    const planLabel = code.grantsPlanId === 'individual_coop' ? 'Co-Op' : code.grantsPlanId === 'free' ? 'Free' : code.grantsPlanId ?? 'Free';
                    const isFoundingCode = code.grantsPlanId === 'individual_coop';
                    return (
                      <div
                        key={code.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg border",
                          isExhausted ? "opacity-40 bg-muted/20" : isFoundingCode ? "bg-amber-500/5 border-amber-500/20" : "bg-muted/10"
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <code className="text-xs font-mono font-semibold tracking-wide shrink-0">
                            {code.id}
                          </code>
                          <Badge variant={isFoundingCode ? "default" : "secondary"} className="shrink-0 text-xs">
                            {planLabel}
                          </Badge>
                          <Badge variant={isExhausted ? "secondary" : "outline"} className="shrink-0 text-xs">
                            {isExhausted ? "Exhausted" : `${code.usedCount ?? 0}/${code.maxUses ?? 1}`}
                          </Badge>
                          {!code.createdBy && (
                            <span className="text-xs text-muted-foreground">system</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!isExhausted && (
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Copy"
                              onClick={() => { navigator.clipboard.writeText(code.id); toast({ title: "Copied!", description: code.id }); }}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          )}
                          {!isExhausted && (
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive/60 hover:text-destructive" title="Revoke"
                              onClick={async () => {
                                try {
                                  await revokeInviteCode(code.id);
                                  setAdminCodes(prev => prev.map(c => c.id === code.id ? { ...c, maxUses: c.usedCount ?? 0 } : c));
                                  toast({ title: "Revoked", description: `${code.id} revoked.` });
                                } catch { toast({ variant: "destructive", title: "Error", description: "Failed to revoke." }); }
                              }}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Create Founding Code */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="font-mono border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                  disabled={isCreatingFoundingCode}
                  onClick={async () => {
                    setIsCreatingFoundingCode(true);
                    try {
                      const result = await createFoundingCode('individual_coop', 10);
                      navigator.clipboard.writeText(result.code);
                      toast({ title: "Founding Code Created!", description: `${result.code} — grants Co-Op membership. Copied!` });
                      getAllInviteCodes().then(setAdminCodes).catch(() => {});
                    } catch (e: unknown) {
                      toast({ title: "Error", description: (e instanceof Error ? e.message : 'Failed'), variant: "destructive" });
                    } finally {
                      setIsCreatingFoundingCode(false);
                    }
                  }}
                >
                  {isCreatingFoundingCode ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Create Founding Code
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Founding codes grant Individual Co-Op membership. Each allows 10 redemptions.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Upgrade to Org (only for individual plan holders) */}
        {currentPlanId === 'individual_coop' && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-border"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="bg-background px-3 text-sm text-muted-foreground">Looking for more?</span>
              </div>
            </div>

            <section>
              <div className="text-center mb-6">
                <div className="flex items-center justify-center space-x-3 mb-2">
                  <Briefcase className="h-7 w-7 text-sky-600" />
                  <h2 className="text-2xl font-semibold tracking-normal text-foreground">Upgrade to Organizational</h2>
                </div>
                <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                  Need tools for your business, brand, or non-profit? Organizational plans include everything you have now, plus professional features.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {organizationalTiers.map((tier) => (
                  <Card key={tier.name} className={cn("flex flex-col shadow-lg", tier.isPopular && "border-primary ring-2 ring-primary")}>
                    {tier.isPopular && (
                      <div className="py-1 px-3 bg-primary text-primary-foreground text-xs font-semibold rounded-t-lg flex items-center justify-center">
                        <Star className="mr-1.5 h-4 w-4" /> Most Popular
                      </div>
                    )}
                    <CardHeader className="pt-6">
                      <div className="flex items-center space-x-3 mb-2">
                        <tier.icon className="h-7 w-7 text-sky-600" />
                        <CardTitle className="text-lg tracking-normal">{tier.name}</CardTitle>
                      </div>
                      <CardDescription>{tier.description}</CardDescription>
                      <div className="flex items-baseline pt-2">
                        <span className="text-2xl font-bold tracking-tighter">{tier.price}</span>
                        {tier.priceDescription && <span className="text-sm text-muted-foreground ml-1">{tier.priceDescription}</span>}
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        {tier.features.map((f, i) => (
                          <li key={i} className="flex items-start">
                            <Check className="h-4 w-4 text-accent mr-2 mt-0.5 shrink-0" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                    <CardFooter>
                      {tier.planId === 'org_enterprise' ? (
                        <Button className="w-full" variant="outline">{tier.cta}</Button>
                      ) : (
                        <Button
                          className="w-full"
                          variant={tier.isPopular ? "default" : "outline"}
                          disabled={loadingPlan === `${tier.planId}-monthly`}
                          onClick={() => handleCheckout(tier.planId, 'monthly')}
                        >
                          {loadingPlan === `${tier.planId}-monthly` && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                          Upgrade — {tier.price}/mo
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    );
  }

  // ──────────────────────────── SALES VIEW (non-members) ────────────────────────────
  return (
    <div className="space-y-12 max-w-6xl mx-auto">
      <header className="text-center">
        <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground font-mono">Join the First Social Media Co-Op</h1>
        <p className="text-lg text-muted-foreground mt-2 max-w-3xl mx-auto">
          We're building a platform owned and governed by its members, not advertisers. Your contribution powers an ad-free, privacy-focused community where you have a real stake.
        </p>
      </header>

      {/* Earn-path progress (only for free users with contributions) */}
      {user && contribSummary && contribSummary.monthlyPoints > 0 && (
        <section>
          <Card className="shadow-lg border-muted">
            <CardHeader>
              <div className="flex items-center space-x-3">
                <TrendingUp className="h-7 w-7 text-muted-foreground" />
                <div>
                  <CardTitle className="text-lg tracking-normal">Your Contribution Progress</CardTitle>
                  <CardDescription>
                    {contribSummary.daysUntilReset !== null
                      ? `Earned membership active — ${contribSummary.daysUntilReset} days until renewal`
                      : 'Keep contributing to earn free membership this month!'}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{contribSummary.contributions.length} contributions</span>
                  <span className="font-medium">
                    {contribSummary.monthlyPoints} / {contribSummary.threshold} pts (this month)
                    {contribSummary.progress >= 100 && ' ✓ Membership earned!'}
                  </span>
                </div>
                <Progress value={contribSummary.progress} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  Earn {contribSummary.threshold} points per month through posts, comments, vibes, and events to maintain free membership. Points reset monthly.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

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

      {/* Founding Member / Invite Code Section */}
      <section>
        <Card className="shadow-lg border-amber-500/50 bg-gradient-to-br from-amber-50/50 to-background dark:from-amber-950/20 dark:to-background">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center space-x-3 mb-2">
              <Sparkles className="h-8 w-8 text-amber-500" />
              <CardTitle className="text-2xl tracking-normal">Founding Member Access</CardTitle>
            </div>
            <CardDescription className="max-w-lg mx-auto">
              Have an invite code? Founding Members get full Co-Op membership — no payment required. Your early contributions help build the community.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 max-w-md mx-auto">
              <Input
                placeholder="Enter invite code (e.g. FOUNDING-ALPHA-001)"
                value={inviteCode}
                onChange={(e) => { setInviteCode(e.target.value); setInviteStatus(null); }}
                className="font-mono uppercase"
              />
              {inviteStatus?.valid ? (
                <Button onClick={handleRedeemCode} disabled={isRedeeming} className="bg-amber-500 hover:bg-amber-600 text-white shrink-0">
                  {isRedeeming ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Gift className="h-4 w-4 mr-2" />}
                  Redeem
                </Button>
              ) : (
                <Button onClick={handleValidateCode} variant="outline" disabled={!inviteCode.trim()} className="shrink-0">
                  Validate
                </Button>
              )}
            </div>
            {inviteStatus?.valid && (
              <p className="text-center text-sm text-amber-600 dark:text-amber-400 mt-3 font-medium">
                ✅ Valid! This code grants <strong>{inviteStatus.planName}</strong> membership.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Individual Tiers */}
      <section>
        <div className="flex items-center justify-center space-x-3 mb-6">
          <User className="h-8 w-8 text-primary" />
          <h2 className="text-3xl font-semibold tracking-normal text-foreground">Individual Tiers</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
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
                    {freeTier.features.map((f, i) => (
                      <li key={i} className="flex items-start">
                        <Check className="h-4 w-4 text-accent mr-2 mt-0.5 shrink-0" /><span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button className="w-full" variant="outline">{freeTier.cta}</Button>
                </CardFooter>
            </Card>

            <Card className="shadow-lg flex flex-col">
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
                  <p className="text-xs text-muted-foreground">or {individualCoopTier.yearlyPrice} {individualCoopTier.yearlyDescription}</p>
                </CardHeader>
                <CardContent className="flex-1 space-y-3">
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {individualCoopTier.features.map((f, i) => (
                      <li key={i} className="flex items-start">
                        <Check className="h-4 w-4 text-accent mr-2 mt-0.5 shrink-0" /><span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="flex-col gap-2">
                  <Button className="w-full" variant="default" disabled={loadingPlan === `${individualCoopTier.planId}-monthly`} onClick={() => handleCheckout(individualCoopTier.planId, 'monthly')}>
                    {loadingPlan === `${individualCoopTier.planId}-monthly` && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    {individualCoopTier.cta} — $7/mo
                  </Button>
                  <Button className="w-full" variant="outline" disabled={loadingPlan === `${individualCoopTier.planId}-yearly`} onClick={() => handleCheckout(individualCoopTier.planId, 'yearly')}>
                    {loadingPlan === `${individualCoopTier.planId}-yearly` && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Annual — $70/yr (save 17%)
                  </Button>
                </CardFooter>
            </Card>

            <Card className="shadow-lg border-primary ring-2 ring-primary flex flex-col">
              <div className="py-1 px-3 bg-primary text-primary-foreground text-xs font-semibold rounded-t-lg flex items-center justify-center">
                <Star className="mr-1.5 h-4 w-4" /> Most Popular
              </div>
               <CardHeader className="pt-6">
                  <div className="flex items-center space-x-3 mb-2">
                    <creatorTier.icon className="h-8 w-8 text-primary" />
                    <CardTitle className="text-xl tracking-normal">{creatorTier.name}</CardTitle>
                  </div>
                  <CardDescription>{creatorTier.description}</CardDescription>
                  <div className="flex items-baseline pt-2">
                    <span className="text-3xl font-bold tracking-tighter">{creatorTier.price}</span>
                    <span className="text-sm text-muted-foreground ml-1">{creatorTier.priceDescription}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">or {creatorTier.yearlyPrice} {creatorTier.yearlyDescription}</p>
                </CardHeader>
                <CardContent className="flex-1 space-y-3">
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {creatorTier.features.map((f, i) => (
                      <li key={i} className="flex items-start">
                        <Check className="h-4 w-4 text-accent mr-2 mt-0.5 shrink-0" /><span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="flex-col gap-2">
                  <Button className="w-full" variant="default" disabled={loadingPlan === `${creatorTier.planId}-monthly`} onClick={() => handleCheckout(creatorTier.planId, 'monthly')}>
                    {loadingPlan === `${creatorTier.planId}-monthly` && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    {creatorTier.cta} — $14/mo
                  </Button>
                  <Button className="w-full" variant="outline" disabled={loadingPlan === `${creatorTier.planId}-yearly`} onClick={() => handleCheckout(creatorTier.planId, 'yearly')}>
                    {loadingPlan === `${creatorTier.planId}-yearly` && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Annual — $140/yr (save 17%)
                  </Button>
                </CardFooter>
            </Card>
        </div>
      </section>
      
      {/* Divider */}
      <div className="relative">
          <div className="absolute inset-0 flex items-center" aria-hidden="true"><div className="w-full border-t border-border"></div></div>
          <div className="relative flex justify-center"><span className="bg-background px-2 text-sm text-muted-foreground"><Briefcase className="h-5 w-5"/></span></div>
      </div>

      {/* Organizational Membership */}
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
                    {tier.features.map((f, i) => (
                      <li key={i} className="flex items-start">
                        <Check className="h-4 w-4 text-accent mr-2 mt-0.5 shrink-0" /><span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="flex-col gap-2">
                  {tier.planId === 'org_enterprise' ? (
                    <Button className="w-full" variant="outline">{tier.cta}</Button>
                  ) : (
                    <>
                      <Button className="w-full" variant={tier.isPopular ? "default" : "outline"} disabled={loadingPlan === `${tier.planId}-monthly`} onClick={() => handleCheckout(tier.planId, 'monthly')}>
                        {loadingPlan === `${tier.planId}-monthly` && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        {tier.cta} — {tier.price}/mo
                      </Button>
                      <Button className="w-full" variant="outline" disabled={loadingPlan === `${tier.planId}-yearly`} onClick={() => handleCheckout(tier.planId, 'yearly')}>
                        {loadingPlan === `${tier.planId}-yearly` && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Annual (save 17%)
                      </Button>
                    </>
                  )}
                </CardFooter>
              </Card>
            ))}
        </div>
      </section>

      {/* Mission-Driven Discount */}
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
