import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, nciiReportLimiter } from '@/lib/auth/rate-limit';
import { validateTurnstileToken } from '@/lib/services/turnstile-service';
import { submitNciiReport } from '@/lib/services/ncii-service';
import { z } from 'zod';

const submitSchema = z.discriminatedUnion('encrypted', [
  // Encrypted path (preferred)
  z.object({
    encrypted: z.literal(true),
    encryptedPayload: z.string().min(1, 'Encrypted payload is required'),
    encryptionIv: z.string().min(1, 'Encryption IV is required'),
    keyGrants: z.array(
      z.object({
        adminId: z.string(),
        wrappedKey: z.string(),
        wrapIv: z.string(),
      })
    ).min(1, 'At least one key grant is required'),
    // Unencrypted metadata
    requesterEmail: z.string().email('Invalid email address').max(320, 'Email is too long'),
    contentType: z.enum(['authentic_ncii', 'deepfake', 'minor']),
    contentUrls: z.array(z.string().max(2000)).max(20).optional(),
    posterUsername: z.string().max(100).optional(),
    searchTerms: z.string().max(500).optional(),
    nonConsentStatement: z.literal(true, {
      errorMap: () => ({ message: 'You must affirm the statement of non-consent' }),
    }),
    isDepictedPerson: z.boolean(),
    turnstileToken: z.string().min(1, 'Security verification is required'),
  }),
  // Plaintext fallback (legacy / no Web Crypto)
  z.object({
    encrypted: z.literal(false),
    requesterName: z.string().min(1, 'Name is required').max(200, 'Name is too long'),
    requesterEmail: z.string().email('Invalid email address').max(320, 'Email is too long'),
    requesterSignature: z.string().min(1, 'Signature is required').max(200, 'Signature is too long'),
    isDepictedPerson: z.boolean(),
    contentType: z.enum(['authentic_ncii', 'deepfake', 'minor']),
    contentDescription: z.string().min(10, 'Please provide a detailed description (at least 10 characters)').max(10000, 'Description is too long'),
    contentUrls: z.array(z.string().max(2000)).max(20).optional(),
    posterUsername: z.string().max(100).optional(),
    searchTerms: z.string().max(500).optional(),
    nonConsentStatement: z.literal(true, {
      errorMap: () => ({ message: 'You must affirm the statement of non-consent' }),
    }),
    turnstileToken: z.string().min(1, 'Security verification is required'),
  }),
]).refine(
  (data) => {
    const hasUrls = data.contentUrls && data.contentUrls.length > 0;
    const hasUsername = data.posterUsername && data.posterUsername.trim().length > 0;
    const hasSearchTerms = data.searchTerms && data.searchTerms.trim().length > 0;
    return hasUrls || hasUsername || hasSearchTerms;
  },
  {
    message: 'At least one content locator is required: URLs, poster username, or search terms.',
    path: ['contentUrls'],
  }
);

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request.headers);
    
    // 1. Rate Limiting check
    try {
      await nciiReportLimiter.check(ip);
    } catch (limitErr: any) {
      return NextResponse.json({ error: limitErr.message }, { status: 429 });
    }

    // 2. Parse and validate payload
    const body = await request.json();
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message ?? 'Invalid input';
      return NextResponse.json({ error: firstError, details: parsed.error.format() }, { status: 400 });
    }

    const { turnstileToken, ...payload } = parsed.data;

    // 3. CAPTCHA verification
    try {
      await validateTurnstileToken(turnstileToken, ip);
    } catch (captchaErr: any) {
      return NextResponse.json({ error: captchaErr.message }, { status: 400 });
    }

    // 4. Submit report via Service
    const result = await submitNciiReport(payload);

    return NextResponse.json({
      trackingNumber: result.trackingNumber,
      message: 'Report submitted successfully. We will review it within 48 hours.',
    });
  } catch (err: unknown) {
    console.error('[api/ncii/submit] Error:', err);
    return NextResponse.json({
      error: 'An unexpected error occurred during submission. Please try again later.',
    }, { status: 500 });
  }
}
