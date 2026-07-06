/**
 * Dev tool: resolve IPs → region code → NSFW gate tier against the local GeoLite2
 * DB. Verifies the IP→region half of the gate (the policy half is covered by
 * src/lib/geo/age-policy.test.ts, which runs in CI without the DB).
 *
 *   npm run check:geoip                       # built-in sample (incl. all-tier coverage)
 *   npm run check:geoip -- 1.2.3.4 5.6.7.8    # resolve specific IPs
 *
 * Needs GEOIP_DB_PATH (or ./geoip/GeoLite2-City.mmdb). The .mmdb is gitignored, so
 * this is a LOCAL tool, not a CI test.
 */
import { Reader } from '@maxmind/geoip2-node';
import { regionTier, lawRegionTier, walletVerifyEnabled } from '../src/lib/geo/age-policy';

const dbPath = process.env.GEOIP_DB_PATH || './geoip/GeoLite2-City.mmdb';

// Best-effort sample IPs spanning each tier. IPs drift over time — this is a sanity
// check, not a source of truth; pass your own IPs as args to test specific cases.
const SAMPLE: Array<[string, string]> = [
  ['128.101.101.101', 'US-MN (open — no law)'],
  ['129.7.0.1', 'US-TX (law state)'],
  ['164.119.0.1', 'US Midwest (law state)'],
  ['8.8.8.8', 'US (no subdivision → open)'],
  ['212.58.224.0', 'GB (blocked — UK)'],
  ['139.130.4.5', 'AU (open — watch)'],
  ['193.51.0.1', 'FR (open — watch)'],
];

async function main() {
  const reader = await Reader.open(dbPath);

  const resolve = (ip: string): { code: string; tier: string; law: string } => {
    try {
      const r = reader.city(ip);
      const country = r?.country?.isoCode ?? null;
      const sub = r?.subdivisions?.[0]?.isoCode ?? null;
      const code = country ? (sub ? `${country}-${sub}` : country) : '';
      return { code: code || '(unknown)', tier: regionTier(code), law: lawRegionTier(code) };
    } catch {
      return { code: '(not found)', tier: regionTier(''), law: lawRegionTier('') };
    }
  };

  const args = process.argv.slice(2);
  const rows: Array<[string, string]> = args.length ? args.map((ip) => [ip, '']) : SAMPLE;

  const stage = walletVerifyEnabled() ? 'Stage 2 — Wallet ENABLED' : 'Stage 1 — Wallet PARKED (law states geo-blocked)';
  console.log(`GeoIP gate check — ${dbPath}\n${stage}\n`);
  for (const [ip, note] of rows) {
    const { code, tier, law } = resolve(ip);
    const mark = tier === 'blocked' ? '⛔' : tier === 'verify' ? '🪪' : '✅';
    // Flag law states that are currently geo-blocked because Wallet verification is parked.
    const parked = law === 'verify' && tier === 'blocked' ? '  (law state, parked→blocked)' : '';
    console.log(`${mark} ${ip.padEnd(16)} → ${code.padEnd(8)} [${tier}]${parked}${note ? `   ${note}` : ''}`);
  }
}

main().catch((e) => {
  console.error('check:geoip failed —', e instanceof Error ? e.message : e);
  process.exit(1);
});
