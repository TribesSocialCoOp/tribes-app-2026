#!/usr/bin/env node
// CI supply-chain gate: fails on any high/critical npm advisory that is not in
// audit-allowlist.json. Allowlist entries carry a reason and an expiry date;
// an expired entry fails the gate so exceptions get re-reviewed.
//
// Gates on root advisories (the `via` objects in `npm audit --json`), so
// packages that are only "high" because they depend on an allowlisted package
// (e.g. micromatch -> braces) don't fail the build on their own.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BLOCKING = new Set(['high', 'critical']);

const allowlist = JSON.parse(readFileSync(new URL('../audit-allowlist.json', import.meta.url), 'utf8'));

let raw;
try {
  raw = execSync('npm audit --json', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch (err) {
  // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
  raw = err.stdout;
}
const report = JSON.parse(raw);
if (report.error) {
  console.error('npm audit failed:', report.error.summary ?? report.error);
  process.exit(2);
}

const today = new Date().toISOString().slice(0, 10);
const blocking = [];
const allowed = new Map();

for (const [pkg, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of vuln.via) {
    if (typeof via !== 'object' || !BLOCKING.has(via.severity)) continue;
    const id = via.url?.split('/').pop();
    const entry = allowlist[id];
    if (entry && entry.expires >= today) {
      allowed.set(id, entry);
    } else {
      blocking.push({ pkg, id, severity: via.severity, title: via.title, expired: entry?.expires });
    }
  }
}

for (const [id, entry] of allowed) {
  console.log(`allowlisted ${id} (${entry.package}, expires ${entry.expires}): ${entry.reason}`);
}

if (blocking.length) {
  console.error(`\n${blocking.length} blocking advisor${blocking.length === 1 ? 'y' : 'ies'}:`);
  for (const b of blocking) {
    const note = b.expired ? ` [allowlist entry expired ${b.expired}]` : '';
    console.error(`  ${b.severity.toUpperCase()} ${b.pkg} ${b.id}: ${b.title}${note}`);
  }
  process.exit(1);
}

console.log('\nNo blocking (high/critical) advisories outside the allowlist.');
