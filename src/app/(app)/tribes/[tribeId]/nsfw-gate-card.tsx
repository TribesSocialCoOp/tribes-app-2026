'use client';

/**
 * NSFW gate screens (issue #32) shown in the tribe feed when the content boundary
 * withholds posts. Three variants map to the policy decisions:
 *   blocked → region where we have no trusted method (cite local policy NEUTRALLY)
 *   verify  → law region: verify privately (the age-gate modal shows the actual
 *             method available for this surface — Google Wallet or the iPhone OS check)
 *   optin   → no-law region: enable the web-set self-attest opt-in
 */
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldAlert, BadgeCheck, Globe2 } from 'lucide-react';
import { useAgeGate } from '@/components/providers/age-gate-provider';
import { NSFW_BLOCKED_REGION_TITLE, NSFW_BLOCKED_REGION_COPY } from '@/lib/age-gate';

export function NsfwGateCard({
  gate,
  onResolved,
}: {
  gate: 'blocked' | 'verify' | 'optin';
  onResolved?: () => void;
}) {
  const { openAgeGate } = useAgeGate();

  if (gate === 'blocked') {
    return (
      <Card className="text-center py-12 shadow-md">
        <CardContent className="flex flex-col items-center justify-center gap-3">
          <Globe2 className="h-14 w-14 text-muted-foreground opacity-70" />
          <h3 className="text-xl font-semibold text-foreground">{NSFW_BLOCKED_REGION_TITLE}</h3>
          <p className="text-muted-foreground max-w-sm">{NSFW_BLOCKED_REGION_COPY}</p>
        </CardContent>
      </Card>
    );
  }

  if (gate === 'verify') {
    return (
      <Card className="text-center py-12 shadow-md">
        <CardContent className="flex flex-col items-center justify-center gap-3">
          <BadgeCheck className="h-14 w-14 text-primary opacity-80" />
          <h3 className="text-xl font-semibold text-foreground">Verify your age to continue</h3>
          <p className="text-muted-foreground max-w-sm">
            Your region requires age verification for adult content. You can verify privately
            — we only learn that you’re over 18, never your ID or birthdate.
          </p>
          <Button className="mt-2" onClick={() => openAgeGate({ onResolved })}>
            Verify my age
          </Button>
        </CardContent>
      </Card>
    );
  }

  // optin — open the unified age-gate modal, which self-attests inline on web and
  // shows clear "enable on the web" guidance on native (no Settings detour).
  return (
    <Card className="text-center py-12 shadow-md">
      <CardContent className="flex flex-col items-center justify-center gap-3">
        <ShieldAlert className="h-14 w-14 text-muted-foreground opacity-70" />
        <h3 className="text-xl font-semibold text-foreground">Enable adult content to view</h3>
        <p className="text-muted-foreground max-w-sm">
          Adult content is hidden by default. Confirm you’re 18 or older to see this Tribe.
        </p>
        <Button className="mt-2" onClick={() => openAgeGate({ onResolved })}>
          Enable adult content
        </Button>
      </CardContent>
    </Card>
  );
}
