'use client';

import React, { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Link from 'next/link';
import { ShieldAlert, CheckCircle, AlertTriangle, Clipboard, ExternalLink, ArrowRight, Info, AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AltchaWidget, type AltchaWidgetRef } from '@/components/altcha-widget';
import { useToast } from '@/hooks/use-toast';
import { toBase64 } from '@/lib/crypto/encoding';

const submitSchema = z.object({
  requesterName: z.string().min(1, 'Full name is required'),
  requesterEmail: z.string().email('Please enter a valid email address'),
  requesterSignature: z.string().min(1, 'Digital signature is required'),
  isDepictedPerson: z.boolean().default(true),
  contentType: z.enum(['authentic_ncii', 'deepfake', 'minor'], {
    required_error: 'Please select a content category',
  }),
  contentDescription: z.string().min(10, 'Please provide a detailed description (at least 10 characters)'),
  contentUrls: z.string().optional(), // We'll parse this as comma-separated or newline-separated on submit
  posterUsername: z.string().optional(),
  searchTerms: z.string().optional(),
  nonConsentStatement: z.literal(true, {
    errorMap: () => ({ message: 'You must affirm the statement of non-consent to proceed' }),
  }),
}).refine(
  (data) => {
    const hasUrls = data.contentUrls && data.contentUrls.trim().length > 0;
    const hasUsername = data.posterUsername && data.posterUsername.trim().length > 0;
    const hasSearchTerms = data.searchTerms && data.searchTerms.trim().length > 0;
    return hasUrls || hasUsername || hasSearchTerms;
  },
  {
    message: 'Please provide at least one way to locate the content: a URL, poster username, or search terms.',
    path: ['contentUrls'], // Show error on the URLs field
  }
);

type FormValues = z.infer<typeof submitSchema>;

export default function ReportNciiPage() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [altchaPayload, setAltchaPayload] = useState<string | null>(null);
  const [trackingNumber, setTrackingNumber] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const altchaRef = useRef<AltchaWidgetRef | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(submitSchema),
    defaultValues: {
      requesterName: '',
      requesterEmail: '',
      requesterSignature: '',
      isDepictedPerson: true,
      contentType: 'authentic_ncii',
      contentDescription: '',
      contentUrls: '',
      posterUsername: '',
      searchTerms: '',
      nonConsentStatement: undefined,
    },
  });

  async function onSubmit(values: FormValues) {
    if (!altchaPayload) {
      toast({
        variant: 'destructive',
        title: 'Security Verification Required',
        description: 'Please complete the bot prevention check before submitting.',
      });
      return;
    }

    setIsLoading(true);

    try {
      // Parse contentUrls from string to array of strings
      const urlsArray = values.contentUrls
        ? values.contentUrls
            .split(/[\n,]+/)
            .map((url) => url.trim())
            .filter((url) => url.length > 0)
        : [];

      let payload: any;
      let admins: any[] = [];
      try {
        const keysRes = await fetch('/api/ncii/admin-keys');
        if (keysRes.ok) {
          const keysData = await keysRes.json();
          admins = keysData.admins || [];
        }
      } catch (err) {
        console.error('Failed to fetch admin keys for client-side encryption:', err);
      }

      if (admins.length > 0) {
        // Generate an AES-256-GCM symmetric key
        const reportKey = await window.crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );

        // Encrypt the PII fields (requesterName, requesterSignature, contentDescription)
        const piiBlob = JSON.stringify({
          requesterName: values.requesterName,
          requesterSignature: values.requesterSignature,
          contentDescription: values.contentDescription,
        });
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encoder = new TextEncoder();
        const piiBytes = encoder.encode(piiBlob);
        const encryptedBuffer = await window.crypto.subtle.encrypt(
          { name: 'AES-GCM', iv, tagLength: 128 },
          reportKey,
          piiBytes
        );

        // Wrap the AES key for each admin using their RSA-OAEP public key
        const keyGrants: any[] = [];
        for (const admin of admins) {
          try {
            const adminPubKey = await window.crypto.subtle.importKey(
              'jwk',
              admin.publicKey,
              { name: 'RSA-OAEP', hash: 'SHA-256' },
              true,
              ['wrapKey']
            );
            const wrappedKeyBuffer = await window.crypto.subtle.wrapKey(
              'raw',
              reportKey,
              adminPubKey,
              { name: 'RSA-OAEP' }
            );
            keyGrants.push({
              adminId: admin.id,
              wrappedKey: toBase64(wrappedKeyBuffer),
              wrapIv: 'none', // RSA-OAEP does not use a symmetric IV
            });
          } catch (wrapErr) {
            console.error(`Failed to wrap key for admin ${admin.id}:`, wrapErr);
          }
        }

        if (keyGrants.length === 0) {
          throw new Error('Encryption failed: No key grants could be successfully created.');
        }

        payload = {
          encrypted: true as const,
          encryptedPayload: toBase64(encryptedBuffer),
          encryptionIv: toBase64(iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength)),
          keyGrants,
          // Unencrypted metadata
          requesterEmail: values.requesterEmail, // required for notifications/tracking
          contentType: values.contentType,
          contentUrls: urlsArray,
          posterUsername: values.posterUsername,
          searchTerms: values.searchTerms,
          nonConsentStatement: values.nonConsentStatement,
          isDepictedPerson: values.isDepictedPerson,
          altchaPayload,
        };
      } else {
        // Plaintext fallback (legacy / no Web Crypto or no admins)
        payload = {
          encrypted: false as const,
          requesterName: values.requesterName,
          requesterEmail: values.requesterEmail,
          requesterSignature: values.requesterSignature,
          isDepictedPerson: values.isDepictedPerson,
          contentType: values.contentType,
          contentDescription: values.contentDescription,
          contentUrls: urlsArray,
          posterUsername: values.posterUsername,
          searchTerms: values.searchTerms,
          nonConsentStatement: values.nonConsentStatement,
          altchaPayload,
        };
      }

      const response = await fetch('/api/ncii/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit report');
      }

      setTrackingNumber(data.trackingNumber);
      toast({
        title: 'Report Submitted Successfully',
        description: 'Our review team will take action within 48 hours.',
      });
      form.reset();
    } catch (error: any) {
      console.error('Submission error:', error);
      toast({
        variant: 'destructive',
        title: 'Submission Failed',
        description: error.message || 'An error occurred during submission. Please try again.',
      });
      // Reset ALTCHA on error
      altchaRef.current?.reset();
      setAltchaPayload(null);
    } finally {
      setIsLoading(false);
    }
  }

  const copyToClipboard = () => {
    if (trackingNumber) {
      navigator.clipboard.writeText(trackingNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: 'Copied!',
        description: 'Tracking number copied to clipboard.',
      });
    }
  };

  if (trackingNumber) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <Card className="border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-950/10 shadow-2xl backdrop-blur-sm overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
          <CardHeader className="text-center pb-4 pt-8">
            <div className="mx-auto w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-10 w-10 text-emerald-500 animate-pulse" />
            </div>
            <CardTitle className="text-3xl font-bold font-mono tracking-tight text-foreground">
              Intake Confirmed
            </CardTitle>
            <CardDescription className="text-emerald-600/80 dark:text-emerald-400/80 max-w-md mx-auto mt-2">
              Your non-consensual intimate imagery (NCII) report has been securely registered and is flagged with critical priority.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-4 px-6 md:px-8">
            <div className="bg-card/80 border rounded-xl p-6 text-center space-y-3 relative overflow-hidden">
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Your Private Tracking Number</p>
              <div className="flex items-center justify-center gap-3">
                <span className="text-2xl md:text-3xl font-mono font-bold tracking-wider text-foreground select-all">
                  {trackingNumber}
                </span>
                <Button size="icon" variant="ghost" className="h-10 w-10 text-muted-foreground hover:text-foreground" onClick={copyToClipboard}>
                  <Clipboard className="h-5 w-5" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Save this code safely. You will need it along with your email address to check status updates publicly.
              </p>
            </div>

            <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4 flex gap-3 text-sm text-amber-600 dark:text-amber-400">
              <Info className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block mb-0.5">SLA Deadline Commitment</span>
                Our dedicated trust and safety team will perform an active hash removal and take down matching content across the entire platform within <strong className="font-bold underline">48 hours</strong>. An automated confirmation has also been sent to your email.
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row gap-3 pt-6 border-t bg-card/20 px-6 md:px-8 py-6">
            <Link href="/ncii-status" className="w-full sm:w-auto flex-1">
              <Button className="w-full bg-foreground hover:bg-foreground/90 text-background flex items-center justify-center gap-2">
                Check Report Status <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setTrackingNumber(null)}>
              File Another Report
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-4">
      {/* SLA Alert banner */}
      <div className="mb-8 p-5 bg-gradient-to-r from-red-500/10 to-amber-500/10 border border-red-500/20 dark:border-red-500/30 rounded-xl flex gap-4 shadow-sm items-start">
        <ShieldAlert className="h-8 w-8 text-red-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            Non-Consensual Intimate Imagery (NCII) Secure Portal
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            In compliance with the Take It Down Act federal obligations, Tribes provides a secure, expedited, and absolute removal pipeline for intimate images or videos shared without permission. All requests receive immediate priority with a strict <strong className="text-foreground font-semibold">48-hour evaluation and removal SLA</strong>.
          </p>
        </div>
      </div>

      <Card className="shadow-2xl border bg-card/60 backdrop-blur-sm overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-indigo-500 to-primary" />
        <CardHeader className="space-y-2 pt-8 pb-6 px-6 md:px-8 border-b">
          <CardTitle className="text-2xl font-bold font-mono tracking-tight">Expedited Intake Form</CardTitle>
          <CardDescription>
            Please provide as much specific detail as possible. All submitted data is stored securely and restricted solely to high-clearance Trust &amp; Safety officers.
          </CardDescription>
        </CardHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <CardContent className="space-y-6 pt-6 px-6 md:px-8">
              {/* Section 1: Reporter Info */}
              <div className="space-y-4">
                <h3 className="text-base font-semibold font-mono tracking-wide border-b pb-2 text-foreground">1. Contact Information</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="requesterName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Your Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} />
                        </FormControl>
                        <FormDescription>For verification and legal processing.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="requesterEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Your Email Address</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="john@example.com" {...field} />
                        </FormControl>
                        <FormDescription>To receive status updates and tracking details.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="isDepictedPerson"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-lg border p-4 shadow-sm bg-card/45">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="font-semibold text-foreground">
                          I am the person depicted in the imagery
                        </FormLabel>
                        <FormDescription className="text-xs">
                          Uncheck this box only if you are acting as an authorized legal representative or parent/guardian of the depicted person.
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              {/* Section 2: Content Details */}
              <div className="space-y-4 pt-2">
                <h3 className="text-base font-semibold font-mono tracking-wide border-b pb-2 text-foreground">2. Content &amp; Categorization</h3>

                <FormField
                  control={form.control}
                  name="contentType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Content Category</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type of content..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="authentic_ncii">Authentic Non-Consensual Intimate Imagery (NCII)</SelectItem>
                          <SelectItem value="deepfake">AI-Generated / Deepfake Intimate Imagery</SelectItem>
                          <SelectItem value="minor">Depiction of a Minor (Under 18) - Immediate Law Enforcement Notification</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Categorizing the content accurately ensures speedier processing by the appropriate team.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contentDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description of Content</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Provide details about the image or video (e.g., visual contents, background elements, locations, context, clothing, dates, how it was captured or distributed)."
                          className="min-h-[100px] resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Be specific. This helps our review team identify and verify the correct imagery for hashing and permanent removal.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="posterUsername"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Poster&apos;s Username <span className="text-muted-foreground font-normal">(at least one locator required)</span></FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. @spammer or spammer" {...field} />
                        </FormControl>
                        <FormDescription>The username of the Tribes account that shared the content.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="searchTerms"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Search Terms or Hashtags <span className="text-muted-foreground font-normal">(at least one locator required)</span></FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. #leaked, private group folder" {...field} />
                        </FormControl>
                        <FormDescription>Search tags or keywords used to locate or identify the post.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="contentUrls"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Infringing Tribes.app URLs <span className="text-muted-foreground font-normal">(at least one locator required)</span></FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="https://tribes.app/posts/12345&#10;https://tribes.app/posts/67890"
                          className="min-h-[80px]"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Provide direct URLs of the offending content, one per line or separated by commas.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Section 3: Affirmations */}
              <div className="space-y-4 pt-2">
                <h3 className="text-base font-semibold font-mono tracking-wide border-b pb-2 text-foreground">3. Legal Declarations</h3>

                <FormField
                  control={form.control}
                  name="nonConsentStatement"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-lg border p-4 shadow-sm bg-red-500/5 dark:bg-red-950/10 border-red-500/20">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="font-semibold text-foreground text-sm flex items-center gap-1.5 cursor-pointer">
                          I swear under penalty of perjury that this content was shared without my consent
                        </FormLabel>
                        <FormDescription className="text-xs leading-normal">
                          By checking this box, you certify under penalty of perjury under the laws of the United States of America that you did not consent to the capture, creation, or distribution of this intimate imagery, and that the representations in this form are accurate and complete.
                        </FormDescription>
                        <FormMessage />
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="requesterSignature"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Digital Signature (Type Full Name)</FormLabel>
                      <FormControl>
                        <Input placeholder="Johnathan Doe" className="font-mono text-base font-semibold border-indigo-500/20 focus-visible:border-indigo-500" {...field} />
                      </FormControl>
                      <FormDescription>Typing your full legal name acts as your binding electronic signature.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Security Verification */}
              <div className="pt-4 border-t flex flex-col items-center justify-center space-y-2 bg-muted/40 rounded-xl p-4">
                <p className="text-xs text-muted-foreground font-semibold flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  Bot Prevention Check
                </p>
                <AltchaWidget
                  ref={altchaRef}
                  onVerified={setAltchaPayload}
                  onExpired={() => setAltchaPayload(null)}
                  onError={() => setAltchaPayload(null)}
                  className="mx-auto"
                />
              </div>
            </CardContent>

            <CardFooter className="px-6 md:px-8 pb-8 pt-4 border-t bg-card/25 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="text-xs text-muted-foreground text-center md:text-left">
                Submission automatically locks matching image hashes and alerts Trust &amp; Safety admins immediately.
              </div>
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full md:w-auto bg-gradient-to-r from-red-600 to-indigo-600 hover:from-red-700 hover:to-indigo-700 text-white font-semibold text-base py-3 px-8 shadow-lg shadow-indigo-500/10 transition-all duration-200"
              >
                {isLoading ? 'Encrypting & Submitting...' : 'File Urgent Report'}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
