'use client';

/**
 * "Blur adult content" view preference (issue #32, Reddit pattern). ON by default;
 * blurs adult media until tapped. Unlike the 18+ opt-in this is a display preference
 * (no PII), so it can be toggled on any surface. Only meaningful once adult content
 * is enabled, but harmless to show always.
 */
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { getBlurAdultContent, setBlurAdultContent } from '@/lib/actions/age-actions';
import { EyeOff, Loader2 } from 'lucide-react';

export function BlurContentSection() {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getBlurAdultContent()
      .then((r) => setEnabled(r.enabled))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function onToggle(next: boolean) {
    setSaving(true);
    try {
      const res = await setBlurAdultContent(next);
      if (res && 'serverError' in res) {
        toast({ title: 'Couldn’t update', description: res.serverError, variant: 'destructive' });
        return;
      }
      setEnabled(next);
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
          <EyeOff className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-xl">Blur Adult Media</CardTitle>
        </div>
        <CardDescription>
          When on, adult images and video are blurred until you tap to reveal them. On by
          default; turning it off shows adult media without the blur.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="blur-adult-toggle" className="flex-1">
            Blur adult media
            <span className="block text-sm font-normal text-muted-foreground">
              Tap to reveal each post.
            </span>
          </Label>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <Switch id="blur-adult-toggle" checked={enabled} disabled={saving} onCheckedChange={onToggle} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
