'use client';

/**
 * Adult-content opt-in (issue #32). The 18+ self-attestation lives HERE, on the
 * web, by design (Apple Reddit-pattern: no in-app toggle). On native we show a
 * read-only note pointing to the website. Enabling is an attestation that the user
 * is 18+; it stores only a timestamp, never any ID or personal data.
 */
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { isNative } from '@/lib/capacitor/platform';
import { getAdultContentOptIn, setAdultContentOptIn } from '@/lib/actions/age-actions';
import { ShieldAlert, Loader2 } from 'lucide-react';

export function AdultContentSection() {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAdultContentOptIn()
      .then((r) => setEnabled(r.enabled))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function onToggle(next: boolean) {
    setSaving(true);
    try {
      // withPublicErrors RETURNS { serverError } (it does not throw) on a handled error.
      const res = await setAdultContentOptIn(next);
      if (res && 'serverError' in res) {
        toast({ title: 'Couldn’t update', description: res.serverError, variant: 'destructive' });
        return;
      }
      setEnabled(next);
      toast({
        title: next ? 'Adult content enabled' : 'Adult content hidden',
        description: next
          ? 'You can now see 18+ tribes where they’re available in your region.'
          : 'Adult content is hidden across the platform.',
      });
    } catch {
      toast({ title: 'Couldn’t update', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-xl">Adult Content (18+)</CardTitle>
        </div>
        <CardDescription>
          Adult content is hidden by default. Turning this on confirms you are 18 or older and lets
          you see 18+ tribes where they’re available in your region. We store only that you opted in —
          never an ID or any personal data. Some regions are unavailable due to local law.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isNative ? (
          <p className="text-sm text-muted-foreground">
            For App Store compliance, adult content can only be enabled on the website at{' '}
            <span className="font-medium">tribes.app</span> (Settings → Adult Content). Once enabled
            there, it applies to the app too.
          </p>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="adult-content-toggle" className="flex-1">
              Show adult content
              <span className="block text-sm font-normal text-muted-foreground">
                I confirm I am 18 or older.
              </span>
            </Label>
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <Switch
                id="adult-content-toggle"
                checked={enabled}
                disabled={saving}
                onCheckedChange={onToggle}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
