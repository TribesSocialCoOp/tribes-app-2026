// @ts-check

/**
 * @fileoverview URL unfurl service — fetches OpenGraph/meta tags from a URL
 * and optionally proxies the OG image through S3 to prevent third-party tracking.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import type { LinkPreviewData } from '@/lib/types';

// ── Security ────────────────────────────────────────────────

/** Only allow HTTP(S) schemes */
const ALLOWED_SCHEMES = /^https?:\/\//i;

/** Block internal/private network ranges */
const BLOCKED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '169.254.',          // Link-local
  'metadata.google.',  // GCP metadata
];

/** Block private IP ranges (10.x, 172.16-31.x, 192.168.x) */
const PRIVATE_IP_REGEX = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/;

function isBlockedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    if (BLOCKED_HOSTS.some(h => hostname.includes(h))) return true;
    if (PRIVATE_IP_REGEX.test(hostname)) return true;

    return false;
  } catch {
    return true;
  }
}

// ── Constants ───────────────────────────────────────────────

const MAX_RESPONSE_SIZE = 2 * 1024 * 1024; // 2MB — some pages (YouTube) are large
const REQUEST_TIMEOUT = 8000;              // 8 seconds
const MAX_REDIRECTS = 5;
const MAX_DESCRIPTION_LENGTH = 300;

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// ── Core Unfurl ─────────────────────────────────────────────

/**
 * Extract the display domain from a URL (e.g., "github.com").
 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Fetch and parse OpenGraph metadata from a URL.
 * 
 * Strategy (two-tier):
 *   1. Direct HTML fetch — fastest, no external dependency, privacy-preserving
 *   2. Microlink API fallback — handles Cloudflare-protected sites
 *   3. Minimal preview (domain + URL) — guaranteed fallback
 */
export async function unfurlUrl(url: string): Promise<LinkPreviewData | null> {
  // Validate URL
  if (!ALLOWED_SCHEMES.test(url)) return null;
  if (isBlockedUrl(url)) return null;

  // Tier 1: Direct fetch
  const direct = await directFetch(url);
  if (direct && direct.title) return direct;

  // Tier 2: Microlink API fallback (handles Cloudflare, JS-rendered pages, etc.)
  const fallback = await fetchViaMicrolink(url);
  if (fallback && fallback.title) return fallback;

  // Tier 3: Return whatever we got (or minimal preview)
  return direct || fallback || { url, siteName: extractDomain(url) };
}

/**
 * Tier 1: Direct HTML fetch with browser-like headers.
 * Fast and privacy-preserving. Fails on Cloudflare JS challenges.
 */
async function directFetch(url: string): Promise<LinkPreviewData | null> {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
      },
      timeout: REQUEST_TIMEOUT,
      maxRedirects: MAX_REDIRECTS,
      maxContentLength: MAX_RESPONSE_SIZE,
      responseType: 'text',
      decompress: true,
    });

    const html = typeof response.data === 'string' ? response.data : '';
    if (!html) return { url, siteName: extractDomain(url) };

    return parseHtmlMetadata(url, html);
  } catch (err) {
    console.warn('[unfurl] Direct fetch failed:', url, err instanceof Error ? err.message : '');
    return null;
  }
}

/**
 * Parse OG/Twitter/meta tags from raw HTML.
 */
function parseHtmlMetadata(url: string, html: string): LinkPreviewData {
  const $ = cheerio.load(html);

  // Extract OG metadata with fallbacks
  const ogTitle = $('meta[property="og:title"]').attr('content')
    || $('meta[name="twitter:title"]').attr('content')
    || $('title').first().text()
    || undefined;

  const ogDescription = $('meta[property="og:description"]').attr('content')
    || $('meta[name="twitter:description"]').attr('content')
    || $('meta[name="description"]').attr('content')
    || undefined;

  let ogImage = $('meta[property="og:image"]').attr('content')
    || $('meta[name="twitter:image"]').attr('content')
    || $('meta[property="og:image:url"]').attr('content')
    || undefined;

  const ogSiteName = $('meta[property="og:site_name"]').attr('content')
    || undefined;

  // Resolve relative image URLs to absolute
  if (ogImage && !ogImage.startsWith('http')) {
    try {
      ogImage = new URL(ogImage, url).href;
    } catch {
      ogImage = undefined;
    }
  }

  // Truncate description
  const description = ogDescription
    ? ogDescription.length > MAX_DESCRIPTION_LENGTH
      ? ogDescription.substring(0, MAX_DESCRIPTION_LENGTH) + '…'
      : ogDescription
    : undefined;

  // Clean up title
  const title = ogTitle?.trim() || undefined;

  return {
    url,
    title,
    description,
    imageUrl: ogImage,
    siteName: ogSiteName?.trim() || extractDomain(url),
  };
}

/**
 * Tier 2: Microlink API fallback.
 * Handles Cloudflare JS challenges and JS-rendered pages.
 * Free tier: 50 req/day — only called when direct fetch fails.
 */
async function fetchViaMicrolink(url: string): Promise<LinkPreviewData | null> {
  try {
    const apiUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}`;
    const response = await axios.get(apiUrl, {
      timeout: 10000, // Microlink can be slower since it renders the page
      headers: { 'User-Agent': USER_AGENT },
    });

    const data = response.data?.data;
    if (!data || response.data?.status !== 'success') return null;

    const description = data.description
      ? data.description.length > MAX_DESCRIPTION_LENGTH
        ? data.description.substring(0, MAX_DESCRIPTION_LENGTH) + '…'
        : data.description
      : undefined;

    return {
      url: data.url || url,
      title: data.title?.trim() || undefined,
      description,
      imageUrl: data.image?.url || undefined,
      siteName: data.publisher?.trim() || extractDomain(url),
    };
  } catch (err) {
    console.warn('[unfurl] Microlink fallback failed:', url, err instanceof Error ? err.message : '');
    return null;
  }
}

// ── S3 Image Proxy ──────────────────────────────────────────

/**
 * Download an OG image and re-host it on S3 to prevent third-party tracking.
 * Returns the proxied CDN URL, or the original URL on failure.
 */
export async function proxyOgImage(
  imageUrl: string,
  userId: string,
): Promise<string> {
  try {
    // Download the image with size limits
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 8000,
      maxContentLength: 2 * 1024 * 1024, // 2MB max for OG images
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'image/*',
      },
    });

    const buffer = Buffer.from(response.data);
    const rawContentType = response.headers?.['content-type'];
    const contentType = typeof rawContentType === 'string' ? rawContentType.split(';')[0].trim() : 'image/jpeg';

    // Determine file extension from content type
    const extMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'image/svg+xml': '.svg',
    };
    const ext = extMap[contentType] || '.jpg';
    const fileName = `og-preview-${Date.now()}${ext}`;

    // Create a File-like object for the S3 upload
    const file = new File([buffer], fileName, { type: contentType });

    // Upload to public S3 bucket (no CSAM scan needed — external content)
    const { uploadImage, recordMediaFile } = await import('@/lib/services/s3-service');
    const result = await uploadImage(file, 'link-previews', 'public-tribe-post', userId);

    // Register in media files for tracking
    await recordMediaFile({
      userId,
      bucket: result.bucket,
      s3Key: result.s3Key,
      context: 'public-tribe-post',
      fileName,
      contentType,
      sizeBytes: result.sizeBytes,
      publicUrl: result.url,
    });

    return result.url || imageUrl; // Fall back to original if no CDN URL
  } catch (err) {
    console.warn('[unfurl-service] Failed to proxy OG image, using original URL:', err instanceof Error ? err.message : '');
    return imageUrl; // Graceful fallback — use original URL
  }
}

/**
 * Full unfurl pipeline: fetch metadata + proxy image through S3.
 */
export async function unfurlAndProxyUrl(
  url: string,
  userId: string,
): Promise<LinkPreviewData | null> {
  const preview = await unfurlUrl(url);
  if (!preview) return null;

  // Proxy the OG image through S3 to prevent third-party tracking
  if (preview.imageUrl) {
    preview.imageUrl = await proxyOgImage(preview.imageUrl, userId);
  }

  return preview;
}
