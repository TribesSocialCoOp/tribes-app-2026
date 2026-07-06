/**
 * @fileoverview CSAM Detection & NCMEC Reporting Service
 *
 * Detection: Meta PDQ perceptual hashing (open source, self-hosted via pdq-wasm)
 * Hash database: NCMEC CyberTipline ESP hash list (fetched at startup, cached locally)
 * Reporting: NCMEC CyberTipline API (direct, no intermediary)
 *
 * Legal basis: 18 USC § 2258A requires reporting when a platform obtains
 * "actual knowledge" of CSAM. This service creates that knowledge pathway
 * for public content only. Bond (E2E) content is excluded at the upload layer.
 *
 * Architecture:
 *   1. computePdqHash()  — local WASM, nothing leaves the server
 *   2. compareToHashList() — compares against a local copy of NCMEC hashes
 *   3. reportToNCMEC()   — files a CyberTipline report (required by law on match)
 *
 * Setup:
 *   1. Register with NCMEC ESP program: espteam@ncmec.org
 *   2. Download their hash list file and place at PDQ_HASH_LIST_PATH
 *   3. Set NCMEC_ESP_ID and NCMEC_ESP_PASSWORD in .env.production
 *
 * Dev mode: If NCMEC_ESP_ID is not set, scanning is skipped with a warning.
 *           Set NCMEC_SKIP_REPORT=true in test environments to suppress API calls.
 */

import * as fs from 'fs';
import { csamLogger } from '@/lib/logger';
import {
  computePdqHash,
  pdqHammingDistance,
  pdqFromHex,
  PDQ_MATCH_THRESHOLD,
} from './pdq-hasher';

// ── Types ──────────────────────────────────────────────────

export interface ScanResult {
  isMatch: boolean;
  matchedHash?: string;   // Hex representation of the NCMEC hash that matched
  confidence?: number;    // Hamming distance (lower = more similar, 0 = exact)
  pdqHash?: string;       // Hex of the computed hash of the uploaded image
  scannedAt: Date;
}

export interface ReportContext {
  uploaderUserId?: string;
  uploaderIp?: string;
  filename?: string;
}

// ── Configuration ──────────────────────────────────────────

const NCMEC_ESP_ID       = process.env.NCMEC_ESP_ID;
const NCMEC_ESP_PASSWORD = process.env.NCMEC_ESP_PASSWORD;
const NCMEC_SKIP_REPORT  = process.env.NCMEC_SKIP_REPORT === 'true';

// Path to locally cached NCMEC hash list (one PDQ hash per line, hex format).
// Resolved lazily (not at module scope) and without path.join(process.cwd(), …) so
// Turbopack's output-file tracer doesn't classify it as "trace the whole project"
// (which bloats the standalone Docker output and warns on every build). A relative
// path resolves against process.cwd() at runtime — identical behavior.
function hashListPath(): string {
  return process.env.PDQ_HASH_LIST_PATH ?? 'data/ncmec-hashes.bin';
}

// NCMEC CyberTipline reporting endpoint (ESP API)
const NCMEC_REPORT_URL = 'https://report.cybertip.org/ispws/outbound';

// ── Hash List Cache ────────────────────────────────────────

/**
 * Hash list cache — stores pre-parsed Uint8Array hashes for fast comparison.
 * Keyed by hex string for deduplication.
 */
let hashListCache: Map<string, Uint8Array> | null = null;
let hashListLoadedAt: Date | null = null;

/**
 * Load the NCMEC hash list from disk.
 * File format: one 64-char hex PDQ hash per line.
 * Cached for 24 hours; reloads automatically.
 * Returns an empty Map if the file doesn't exist (dev mode).
 */
async function getHashList(): Promise<Map<string, Uint8Array>> {
  const now = new Date();
  const cacheAgeMs = hashListLoadedAt
    ? now.getTime() - hashListLoadedAt.getTime()
    : Infinity;

  if (hashListCache && cacheAgeMs < 24 * 60 * 60 * 1000) {
    return hashListCache;
  }

  try {
    const hashListFile = hashListPath();
    if (!fs.existsSync(hashListFile)) {
      csamLogger.warn(
        { path: hashListFile },
        'NCMEC hash list not found — CSAM scanning disabled. ' +
        'Register with NCMEC (espteam@ncmec.org) to obtain the hash list.'
      );
      hashListCache = new Map();
      hashListLoadedAt = now;
      return hashListCache;
    }

    const raw = fs.readFileSync(hashListFile, 'utf-8');
    const hexLines = raw
      .split('\n')
      .map(h => h.trim().toLowerCase())
      .filter(h => h.length === 64);

    // Pre-parse hex → Uint8Array for fast comparison at scan time
    hashListCache = new Map();
    for (const hex of hexLines) {
      hashListCache.set(hex, await pdqFromHex(hex));
    }
    hashListLoadedAt = now;

    csamLogger.info(
      { count: hashListCache.size, path: hashListFile },
      'NCMEC hash list loaded'
    );
    return hashListCache;
  } catch (err) {
    csamLogger.error({ err }, 'Failed to load NCMEC hash list');
    hashListCache = new Map();
    hashListLoadedAt = now;
    return hashListCache;
  }
}

// ── Core: Image Scanning ───────────────────────────────────

/**
 * Scan an image buffer for CSAM using PDQ perceptual hashing.
 *
 * Process:
 *  1. Compute PDQ hash of the image (local WASM — nothing leaves the server)
 *  2. Compare against locally cached NCMEC hash list
 *  3. Check Hamming distance against all list entries (threshold: ≤ 31 bits)
 *
 * Fails open (allows upload) if:
 *  - NCMEC credentials are not configured (dev mode)
 *  - Hash list is empty (not yet obtained from NCMEC)
 *
 * @param buffer   Raw image bytes
 * @param filename Original filename (for logging only)
 */
export async function scanForCSAM(
  buffer: Buffer,
  filename: string
): Promise<ScanResult> {
  const scannedAt = new Date();

  // Dev-mode bypass: warn but allow if not configured
  if (!NCMEC_ESP_ID) {
    csamLogger.warn(
      { filename },
      'NCMEC_ESP_ID not set — CSAM scanning skipped. ' +
      'Register at espteam@ncmec.org before accepting public uploads.'
    );
    return { isMatch: false, scannedAt };
  }

  // Step 1: Compute PDQ hash (local, nothing leaves server)
  const hashResult = await computePdqHash(buffer);

  if (!hashResult) {
    // Image too small/uniform to hash — allow but log
    csamLogger.debug({ filename }, 'PDQ hash skipped (low quality image)');
    return { isMatch: false, scannedAt };
  }

  const { hash: pdqHashBytes, hashHex: pdqHash, quality } = hashResult;
  csamLogger.debug({ filename, pdqHash, quality }, 'PDQ hash computed');

  // Step 2: Compare against NCMEC hash list
  const hashList = await getHashList();

  if (hashList.size === 0) {
    csamLogger.warn({ filename }, 'NCMEC hash list is empty — scanning skipped');
    return { isMatch: false, pdqHash, scannedAt };
  }

  // Check all known hashes via Hamming distance
  // (exact match is distance 0, caught by the same loop)
  for (const [knownHex, knownBytes] of hashList) {
    try {
      const distance = await pdqHammingDistance(pdqHashBytes, knownBytes);
      if (distance <= PDQ_MATCH_THRESHOLD) {
        csamLogger.warn(
          { filename, pdqHash, matchedHash: knownHex, distance },
          distance === 0
            ? 'PDQ exact match found'
            : 'PDQ near-match found (Hamming distance within threshold)'
        );
        return {
          isMatch: true,
          matchedHash: knownHex,
          confidence: distance,
          pdqHash,
          scannedAt,
        };
      }
    } catch {
      continue; // Skip malformed hash entries
    }
  }

  csamLogger.debug({ filename, pdqHash }, 'PDQ scan clear — no match');
  return { isMatch: false, pdqHash, scannedAt };
}

// ── NCMEC CyberTipline Reporting ───────────────────────────

/**
 * File a CyberTipline report with NCMEC.
 * Required by 18 USC § 2258A upon obtaining actual knowledge of CSAM.
 *
 * Always logs at FATAL severity (this is a legal event with audit trail requirements).
 * Skips the API call if NCMEC_SKIP_REPORT=true (for test environments only).
 *
 * NCMEC CyberTipline ESP API reference:
 * https://www.missingkids.org/content/dam/missingkids/pdfs/NCMEC-ESP-API-Guide.pdf
 */
export async function reportToNCMEC(
  scanResult: ScanResult,
  context: ReportContext
): Promise<void> {
  // Always create an audit log entry — this is a legal event
  csamLogger.fatal(
    {
      matchedHash: scanResult.matchedHash,
      pdqHash: scanResult.pdqHash,
      confidence: scanResult.confidence,
      uploaderUserId: context.uploaderUserId ?? 'unknown',
      uploaderIp: context.uploaderIp ?? 'unknown',
      filename: context.filename ?? 'unknown',
      detectedAt: scanResult.scannedAt.toISOString(),
      reportedAt: new Date().toISOString(),
      willReport: !NCMEC_SKIP_REPORT,
    },
    'CSAM DETECTED — CyberTipline report initiated'
  );

  if (NCMEC_SKIP_REPORT) {
    csamLogger.warn(
      'NCMEC_SKIP_REPORT=true — suppressing API call (test environment only)'
    );
    return;
  }

  if (!NCMEC_ESP_ID || !NCMEC_ESP_PASSWORD) {
    csamLogger.fatal(
      'NCMEC credentials missing — CANNOT file automated report. ' +
      'FILE MANUALLY AT: https://www.missingkids.org/gethelpnow/cybertipline'
    );
    return;
  }

  try {
    // NCMEC CyberTipline ESP API uses HTTP Basic Auth + XML body
    // Reference: NCMEC ESP API Guide (provided after ESP registration)
    const reportXml = buildCyberTiplineXml(scanResult, context);
    const credentials = Buffer.from(`${NCMEC_ESP_ID}:${NCMEC_ESP_PASSWORD}`).toString('base64');

    const response = await fetch(NCMEC_REPORT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'text/xml',
        'User-Agent': 'Tribes.app CSAM Detection/1.0',
      },
      body: reportXml,
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const text = await response.text();
      csamLogger.fatal(
        { status: response.status, body: text },
        'NCMEC CyberTipline report FAILED — file manually at missingkids.org/cybertipline'
      );
      return;
    }

    const responseText = await response.text();
    csamLogger.fatal(
      { response: responseText },
      'NCMEC CyberTipline report filed successfully'
    );
  } catch (err) {
    csamLogger.fatal(
      { err },
      'NCMEC report request threw — file manually at missingkids.org/cybertipline'
    );
  }
}

// ── XML Builder ────────────────────────────────────────────

/**
 * Build the NCMEC CyberTipline ESP report XML.
 * Format per NCMEC ESP API Guide (available after ESP registration).
 *
 * Note: The exact XML schema is provided by NCMEC after ESP approval.
 * This is a best-effort implementation based on public documentation.
 * Verify field names against the official schema once registered.
 */
function buildCyberTiplineXml(
  scanResult: ScanResult,
  context: ReportContext
): string {
  const now = new Date().toISOString();
  const ip = context.uploaderIp ?? 'unknown';

  return `<?xml version="1.0" encoding="UTF-8"?>
<CyberTiplineReport xmlns="http://www.ncmec.org/cybertipline/v2">
  <ESP>
    <ESPName>Tribes.app</ESPName>
  </ESP>
  <IncidentSummary>
    <IncidentType>Child Pornography (possession, manufacture, and distribution)</IncidentType>
    <IncidentDateTime>${now}</IncidentDateTime>
  </IncidentSummary>
  <InternetDetails>
    <InternetConnectionType>Web</InternetConnectionType>
    <IPAddress>${escapeXml(ip)}</IPAddress>
    <EventDateTime>${now}</EventDateTime>
  </InternetDetails>
  <FileDetails>
    <FileName>${escapeXml(context.filename ?? 'unknown')}</FileName>
    <ImageHash type="PDQ">${escapeXml(scanResult.pdqHash ?? '')}</ImageHash>
    <MatchedHash type="PDQ">${escapeXml(scanResult.matchedHash ?? '')}</MatchedHash>
    <HammingDistance>${scanResult.confidence ?? 0}</HammingDistance>
  </FileDetails>
</CyberTiplineReport>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
