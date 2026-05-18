#!/usr/bin/env node
/**
 * Tribes Production Metrics — "Poor Man's Analytics"
 * 
 * Runs pure-SELECT queries against the database. No writes, no locks, no transactions.
 * Uses the project's existing pg driver via DATABASE_URL.
 * 
 * Usage:
 *   node scripts/run-metrics.mjs                          # uses .env.local DATABASE_URL
 *   DATABASE_URL="postgres://..." node scripts/run-metrics.mjs  # override for prod
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local if no DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  try {
    const envFile = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf-8');
    for (const line of envFile.split('\n')) {
      const match = line.match(/^([A-Z_]+)=(.+)$/);
      if (match && match[1] === 'DATABASE_URL') {
        process.env.DATABASE_URL = match[2].trim();
      }
    }
  } catch { /* ignore */ }
}

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://tribes:tribes_dev@127.0.0.1:5432/tribes';

const pool = new pg.Pool({ 
  connectionString: DATABASE_URL,
  max: 1,                    // Single connection — minimal footprint
});

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';

function printTable(rows, title) {
  if (!rows || rows.length === 0) {
    console.log(`  ${DIM}(no data)${RESET}\n`);
    return;
  }
  const cols = Object.keys(rows[0]);
  const widths = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
  
  // Header
  console.log('  ' + cols.map((c, i) => c.padEnd(widths[i])).join('  '));
  console.log('  ' + widths.map(w => '─'.repeat(w)).join('──'));
  
  // Rows
  for (const row of rows) {
    console.log('  ' + cols.map((c, i) => String(row[c] ?? '').padEnd(widths[i])).join('  '));
  }
  console.log('');
}

async function runSection(client, title, sql) {
  console.log(`${CYAN}${BOLD}${title}${RESET}`);
  try {
    const start = performance.now();
    const result = await client.query(sql);
    const ms = (performance.now() - start).toFixed(1);
    printTable(result.rows, title);
    console.log(`  ${DIM}(${ms}ms)${RESET}\n`);
  } catch (err) {
    console.log(`  ${YELLOW}⚠ Query error: ${err.message}${RESET}\n`);
  }
}

async function main() {
  console.log(`\n${BOLD}╔══════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}║   🏘️  TRIBES PLATFORM METRICS         ║${RESET}`);
  console.log(`${BOLD}╚══════════════════════════════════════╝${RESET}`);
  console.log(`${DIM}Database: ${DATABASE_URL.replace(/:[^:@]+@/, ':***@')}${RESET}`);
  console.log(`${DIM}Time: ${new Date().toLocaleString()}${RESET}\n`);

  const client = await pool.connect();
  
  try {
    // ── 1. Platform Summary ──
    await runSection(client, '🎯 PLATFORM SUMMARY', `
      SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM tribes) AS tribes,
        (SELECT COUNT(*) FROM bonds) AS bonds,
        (SELECT COUNT(*) FROM posts WHERE is_removed = false) AS posts,
        (SELECT COUNT(*) FROM comments) AS comments,
        (SELECT COUNT(*) FROM messages) AS dms,
        (SELECT COUNT(*) FROM events) AS events,
        (SELECT COUNT(*) FROM vibes) AS vibes
    `);

    // ── 2. User Totals ──
    await runSection(client, '👥 USER TOTALS', `
      SELECT
        COUNT(*) AS total_users,
        COUNT(*) FILTER (WHERE role != 'Human_Free') AS paid_or_founding,
        COUNT(*) FILTER (WHERE role = 'Human_Free') AS free_users,
        COUNT(*) FILTER (WHERE email_verified = true) AS email_verified,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS signups_7d,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS signups_24h
      FROM users
    `);

    // ── 3. Signups by Day ──
    await runSection(client, '📈 SIGNUPS BY DAY (last 30 days)', `
      SELECT
        TO_CHAR(created_at AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD Dy') AS day,
        COUNT(*) AS signups,
        STRING_AGG(SUBSTRING(name FROM 1 FOR 15), ', ' ORDER BY created_at) AS who
      FROM users
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at AT TIME ZONE 'America/Los_Angeles'),
               TO_CHAR(created_at AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD Dy')
      ORDER BY DATE(created_at AT TIME ZONE 'America/Los_Angeles') DESC
    `);

    // ── 4. Signups by Day of Week ──
    await runSection(client, '📊 SIGNUPS BY DAY OF WEEK', `
      SELECT
        TRIM(TO_CHAR(created_at AT TIME ZONE 'America/Los_Angeles', 'Day')) AS day_name,
        COUNT(*) AS signups
      FROM users
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY 1, EXTRACT(DOW FROM created_at AT TIME ZONE 'America/Los_Angeles')
      ORDER BY EXTRACT(DOW FROM created_at AT TIME ZONE 'America/Los_Angeles')
    `);

    // ── 5. Auth Methods ──
    await runSection(client, '🔐 AUTH METHOD BREAKDOWN', `
      SELECT 'Passkey' AS method, COUNT(DISTINCT user_id) AS users FROM credentials
      UNION ALL
      SELECT 'Google OAuth', COUNT(DISTINCT user_id) FROM oauth_accounts WHERE provider = 'google'
      UNION ALL
      SELECT 'Apple OAuth', COUNT(DISTINCT user_id) FROM oauth_accounts WHERE provider = 'apple'
      ORDER BY users DESC
    `);

    // ── 6. Active Sessions ──
    await runSection(client, '🟢 ACTIVE SESSIONS (right now)', `
      SELECT
        COUNT(*) AS active_sessions,
        COUNT(DISTINCT user_id) AS unique_users
      FROM sessions
      WHERE expires_at > NOW() AND revoked_at IS NULL
    `);

    // ── 7. Logins by Day ──
    await runSection(client, '🔑 LOGINS BY DAY (last 14 days)', `
      SELECT
        TO_CHAR(created_at AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD Dy') AS day,
        COUNT(*) AS logins,
        COUNT(DISTINCT user_id) AS unique_users
      FROM sessions
      WHERE created_at >= NOW() - INTERVAL '14 days'
      GROUP BY DATE(created_at AT TIME ZONE 'America/Los_Angeles'),
               TO_CHAR(created_at AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD Dy')
      ORDER BY DATE(created_at AT TIME ZONE 'America/Los_Angeles') DESC
    `);

    // ── 8. Content Volume ──
    await runSection(client, '📝 CONTENT VOLUME', `
      SELECT
        (SELECT COUNT(*) FROM posts WHERE is_removed = false) AS total_posts,
        (SELECT COUNT(*) FROM posts WHERE is_removed = false AND created_at >= NOW() - INTERVAL '7 days') AS posts_7d,
        (SELECT COUNT(*) FROM comments) AS total_comments,
        (SELECT COUNT(*) FROM comments WHERE created_at >= NOW() - INTERVAL '7 days') AS comments_7d,
        (SELECT COUNT(*) FROM vibes) AS total_vibes,
        (SELECT COUNT(*) FROM vibes WHERE created_at >= NOW() - INTERVAL '7 days') AS vibes_7d
    `);

    // ── 9. Posts by Day ──
    await runSection(client, '📄 POSTS BY DAY (last 14 days)', `
      SELECT
        TO_CHAR(created_at AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD Dy') AS day,
        COUNT(*) AS posts,
        COUNT(DISTINCT author_id) AS unique_authors
      FROM posts
      WHERE created_at >= NOW() - INTERVAL '14 days' AND is_removed = false
      GROUP BY DATE(created_at AT TIME ZONE 'America/Los_Angeles'),
               TO_CHAR(created_at AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD Dy')
      ORDER BY DATE(created_at AT TIME ZONE 'America/Los_Angeles') DESC
    `);

    // ── 10. Top Engaged Users ──
    await runSection(client, '🏆 TOP ENGAGED USERS (last 7 days)', `
      SELECT
        u.name,
        u.role,
        COALESCE(p.cnt, 0) AS posts,
        COALESCE(c.cnt, 0) AS comments,
        COALESCE(v.cnt, 0) AS vibes,
        COALESCE(p.cnt, 0) + COALESCE(c.cnt, 0) + COALESCE(v.cnt, 0) AS total
      FROM users u
      LEFT JOIN (SELECT author_id, COUNT(*) AS cnt FROM posts WHERE created_at >= NOW() - INTERVAL '7 days' AND is_removed = false GROUP BY 1) p ON p.author_id = u.id
      LEFT JOIN (SELECT author_id, COUNT(*) AS cnt FROM comments WHERE created_at >= NOW() - INTERVAL '7 days' GROUP BY 1) c ON c.author_id = u.id
      LEFT JOIN (SELECT user_id, COUNT(*) AS cnt FROM vibes WHERE created_at >= NOW() - INTERVAL '7 days' GROUP BY 1) v ON v.user_id = u.id
      WHERE COALESCE(p.cnt, 0) + COALESCE(c.cnt, 0) + COALESCE(v.cnt, 0) > 0
      ORDER BY total DESC
      LIMIT 15
    `);

    // ── 11. Tribe Health ──
    await runSection(client, '🏘️ TRIBE HEALTH', `
      SELECT
        t.name,
        t.member_count AS members,
        COUNT(DISTINCT p.id) FILTER (WHERE p.created_at >= NOW() - INTERVAL '7 days') AS posts_7d,
        COUNT(DISTINCT p.author_id) FILTER (WHERE p.created_at >= NOW() - INTERVAL '7 days') AS posters_7d,
        TO_CHAR(t.created_at, 'MM-DD') AS created
      FROM tribes t
      LEFT JOIN posts p ON p.tribe_id = t.id AND p.is_removed = false
      GROUP BY t.id, t.name, t.member_count, t.created_at
      ORDER BY t.member_count DESC NULLS LAST
      LIMIT 20
    `);

    // ── 12. Bond Activity ──
    await runSection(client, '🔗 BOND ACTIVITY', `
      SELECT
        (SELECT COUNT(*) FROM bonds) AS total_bonds,
        (SELECT COUNT(*) FROM bond_requests WHERE status = 'pending') AS pending_requests,
        (SELECT COUNT(*) FROM bonds WHERE inner_circle = true) AS inner_circle
    `);

    // ── 13. Invite Code Usage ──
    await runSection(client, '🎟️ INVITE CODE USAGE', `
      SELECT
        ic.id AS code,
        ic.type,
        p.name AS plan,
        ic.max_uses,
        ic.used_count,
        TO_CHAR(ic.created_at, 'MM-DD') AS created
      FROM invite_codes ic
      JOIN plans p ON p.id = ic.grants_plan_id
      ORDER BY ic.created_at DESC
      LIMIT 15
    `);

    // ── 14. Returning Users (retention) ──
    await runSection(client, '🔄 RETURNING USERS (rough retention)', `
      SELECT
        COUNT(DISTINCT s.user_id) AS returning_users,
        (SELECT COUNT(*) FROM users WHERE created_at < NOW() - INTERVAL '7 days') AS eligible_users,
        CASE 
          WHEN (SELECT COUNT(*) FROM users WHERE created_at < NOW() - INTERVAL '7 days') > 0
          THEN ROUND(COUNT(DISTINCT s.user_id)::numeric / (SELECT COUNT(*) FROM users WHERE created_at < NOW() - INTERVAL '7 days') * 100, 1)
          ELSE 0
        END AS retention_pct
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.created_at >= NOW() - INTERVAL '7 days'
        AND u.created_at < NOW() - INTERVAL '7 days'
    `);

    // ── 15. DM Activity ──
    await runSection(client, '💬 DM ACTIVITY', `
      SELECT
        (SELECT COUNT(*) FROM messages) AS total_messages,
        (SELECT COUNT(*) FROM messages WHERE sent_at >= NOW() - INTERVAL '7 days') AS messages_7d,
        (SELECT COUNT(DISTINCT sender_id) FROM messages WHERE sent_at >= NOW() - INTERVAL '7 days') AS senders_7d
    `);

  } finally {
    client.release();
    await pool.end();
  }
  
  console.log(`${GREEN}${BOLD}✓ All queries complete. No data was modified.${RESET}\n`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
