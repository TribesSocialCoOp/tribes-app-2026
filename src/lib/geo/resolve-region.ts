import 'server-only';
import { headers } from 'next/headers';
import { getClientIp } from '@/lib/auth/rate-limit';

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
let readerPromise: Promise<CityReader | null> | null = null;

async function getReader(): Promise<CityReader | null> {
  const dbPath = process.env.GEOIP_DB_PATH;
  if (!dbPath) return null;
  if (!readerPromise) {
    readerPromise = (async () => {
      const { Reader } = await import('@maxmind/geoip2-node');
      return (await Reader.open(dbPath)) as unknown as CityReader;
    })().catch((e) => {
      console.warn('[geo] MaxMind DB open failed (region → unknown):', (e as Error).message);
      return null;
    });
  }
  return readerPromise;
}

/** Resolve the caller's region from their IP (local DB; nothing stored or shared). */
export async function getRequestRegion(): Promise<RequestRegion> {
  const override = process.env.AGE_GEO_OVERRIDE;
  if (override) {
    const [country, subdivision] = override.split('-');
    return { country: country || null, subdivision: subdivision || null };
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
