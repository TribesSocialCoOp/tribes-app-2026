import 'server-only';
import { headers } from 'next/headers';
import { getClientIp } from '@/lib/auth/rate-limit';
import { isRealProd } from '@/lib/age-verification/os-age-policy';

/**
 * Privacy-respecting region resolution for the NSFW age gate (issue #32).
 *
 * IP → region is resolved IN-PROCESS against a LOCAL MaxMind GeoLite2 database.
 * The IP is never sent to any third-party geolocation service, and neither the IP
 * nor the resolved region is persisted — both are read for the request and
 * discarded. No DB configured (or lookup fails) → unknown → caller treats it as
 * the permissive default (self-attest).
 *
 * Ops: set GEOIP_DB_PATH to a GeoLite2-City `.mmdb` (free MaxMind license).
 * Dev/test: set AGE_GEO_OVERRIDE=US-KS (or GB) to force a region without a DB.
 */

export interface RequestRegion {
  country: string | null;     // ISO 3166-1 alpha-2, e.g. 'US', 'GB'
  subdivision: string | null; // ISO 3166-2 region, e.g. 'KS' (US state)
}

/** 'US-KS' | 'GB' | 'US' | '' — for matching the block list. */
export function regionCode(r: RequestRegion): string {
  if (!r.country) return '';
  return r.subdivision ? `${r.country}-${r.subdivision}` : r.country;
}

type CityReader = { city: (ip: string) => { country?: { isoCode?: string }; subdivisions?: Array<{ isoCode?: string }> } };
let readerPromise: Promise<CityReader> | null = null;

async function getReader(): Promise<CityReader | null> {
  const dbPath = process.env.GEOIP_DB_PATH;
  if (!dbPath) return null;
  if (!readerPromise) {
    readerPromise = (async () => {
      const { Reader } = await import('@maxmind/geoip2-node');
      return (await Reader.open(dbPath)) as unknown as CityReader;
    })();
  }
  try {
    return await readerPromise;
  } catch (e) {
    // Do NOT cache the failure: the DB may be provisioned moments later (e.g. by
    // geoipupdate on first deploy). Reset so the next request retries the open
    // instead of being stuck 'unknown' until a container restart.
    readerPromise = null;
    console.warn('[geo] MaxMind DB open failed (region → unknown, will retry):', (e as Error).message);
    return null;
  }
}

/** Resolve the caller's region from their IP (local DB; nothing stored or shared). */
export async function getRequestRegion(): Promise<RequestRegion> {
  // Geo overrides (DEV/E2E/STAGING ONLY) — the sanctioned way to fake a region tier
  // for testing (never IP spoofing; forged IP headers are not trusted):
  //   - `x-tribes-geo` request header: per-request, no restart (Playwright sets US-KS).
  //   - AGE_GEO_OVERRIDE env: process-wide, requires a restart to change.
  // Staging runs a production build (NODE_ENV=production), so it's marked with
  // TRIBES_ENV=staging (see src/db/seed-staging.ts). Real prod sets neither → both
  // overrides are ignored there. isRealProd() is the single shared predicate.
  const overridesAllowed = !isRealProd();
  if (overridesAllowed) {
    try {
      const code = (await headers()).get('x-tribes-geo');
      if (code) {
        const [country, subdivision] = code.split('-');
        return { country: country || null, subdivision: subdivision || null };
      }
    } catch { /* no request context */ }

    const override = process.env.AGE_GEO_OVERRIDE;
    if (override) {
      const [country, subdivision] = override.split('-');
      return { country: country || null, subdivision: subdivision || null };
    }
  }
  try {
    const reader = await getReader();
    if (!reader) return { country: null, subdivision: null };
    const h = await headers();
    const ip = getClientIp(h);
    const res = reader.city(ip);
    return {
      country: res?.country?.isoCode ?? null,
      subdivision: res?.subdivisions?.[0]?.isoCode ?? null,
    };
  } catch {
    // AddressNotFoundError / private IP / any failure → unknown (permissive default).
    return { country: null, subdivision: null };
  }
}

import type { Surface } from '@/lib/geo/age-policy';
export type { Surface };

/** Delivery surface, from the X-Tribes-Surface header the Capacitor builds set. */
export async function getSurface(): Promise<Surface> {
  try {
    const h = await headers();
    const s = h.get('x-tribes-surface');
    if (s === 'ios' || s === 'ios-cap') return 'ios';
    if (s === 'android' || s === 'android-cap') return 'android';
  } catch { /* no request context */ }
  return 'web';
}
