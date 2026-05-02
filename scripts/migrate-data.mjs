#!/usr/bin/env node
/**
 * migrate-data.mjs — SQLite → PostgreSQL data migration
 * Handles epoch-int → timestamp conversion that pgloader cannot.
 *
 * Usage (on production server, inside a node container):
 *   node scripts/migrate-data.mjs
 *
 * Env:
 *   SQLITE_PATH  — path to SQLite backup file
 *   DATABASE_URL — PostgreSQL connection string
 */
import Database from 'better-sqlite3';
import pg from 'pg';

const SQLITE_PATH = process.env.SQLITE_PATH || '/opt/tribes/backup-sqld-pre-pg.db';
const PG_URL      = process.env.DATABASE_URL;
if (!PG_URL) { console.error('Set DATABASE_URL'); process.exit(1); }

const sqlite = new Database(SQLITE_PATH, { readonly: true });
const client = new pg.Client(PG_URL);
await client.connect();
console.log('✓ Connected to both databases');

// Tables with data will be fetched dynamically
const tablesResult = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations' ORDER BY name").all();
const TABLES = tablesResult.map(r => r.name);

// Columns that store Unix epoch integers and need → timestamp conversion
const EPOCH_COLUMNS = new Set([
  'created_at', 'updated_at', 'expires_at', 'joined_at', 'redeemed_at',
  'dormant_at', 'reconnect_requested_at', 'last_interacted_at',
  'deleted_at', 'event_date', 'used_at', 'reminder_sent_at',
  'deletion_requested_at', 'scheduled_deletion_at', 'edited_at',
  'blocked_at', 'cancel_at', 'last_refreshed_at', 'last_updated_at',
  'promoted_at', 'published_at', 'read_at', 'reported_at', 'requested_at',
  'resolved_at', 'revoked_at', 'sent_at', 'current_period_end', 'current_period_start',
]);

// Columns that store 0/1 integers and need → boolean conversion
const BOOL_COLUMNS = new Set([
  'inner_circle', 'is_public', 'encrypted', 'is_read', 'is_verified',
  'email_verified', 'mfa_enabled', 'ai_data_sharing_enabled', 'hip_enabled',
]);

function convertRow(row) {
  const converted = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      converted[key] = null;
    } else if (EPOCH_COLUMNS.has(key) && typeof value === 'number') {
      // Unix epoch seconds → ISO timestamp
      converted[key] = new Date(value * 1000).toISOString();
    } else if (BOOL_COLUMNS.has(key)) {
      converted[key] = Boolean(value);
    } else if (value instanceof Buffer || value instanceof Uint8Array) {
      converted[key] = value; // pg handles Buffer → bytea natively
    } else {
      converted[key] = value;
    }
  }
  return converted;
}

async function migrateTable(tableName) {
  const rows = sqlite.prepare(`SELECT * FROM "${tableName}"`).all();
  if (rows.length === 0) { console.log(`  ${tableName}: 0 rows (skip)`); return 0; }

  // Get column names from the first row
  const columns = Object.keys(rows[0]);

  // Check which columns actually exist in the PG table
  const pgColResult = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
    [tableName]
  );
  const pgColumns = new Set(pgColResult.rows.map(r => r.column_name));

  // Only include columns that exist in both SQLite and PG
  const sharedColumns = columns.filter(c => pgColumns.has(c));
  const skippedColumns = columns.filter(c => !pgColumns.has(c));
  if (skippedColumns.length > 0) {
    console.log(`  ⚠ ${tableName}: skipping columns not in PG: ${skippedColumns.join(', ')}`);
  }

  // Truncate existing data
  await client.query(`DELETE FROM "${tableName}"`);

  let inserted = 0;
  for (const row of rows) {
    const converted = convertRow(row);
    const vals = sharedColumns.map(c => converted[c]);
    const placeholders = sharedColumns.map((_, i) => `$${i + 1}`).join(', ');
    const colList = sharedColumns.map(c => `"${c}"`).join(', ');

    try {
      await client.query(`INSERT INTO "${tableName}" (${colList}) VALUES (${placeholders})`, vals);
      inserted++;
    } catch (err) {
      console.error(`  ✗ ${tableName} row error:`, err.message);
      console.error(`    Row data:`, JSON.stringify(converted, null, 2).slice(0, 500));
    }
  }
  console.log(`  ✓ ${tableName}: ${inserted}/${rows.length} rows`);
  return inserted;
}

// Disable FK checks during migration
await client.query(`SET session_replication_role = 'replica'`);

let totalRows = 0;
for (const table of TABLES) {
  try {
    totalRows += await migrateTable(table);
  } catch (err) {
    console.error(`  ✗ ${table}: ${err.message}`);
  }
}

await client.query(`SET session_replication_role = 'origin'`);

console.log(`\n═══════════════════════════════════════`);
console.log(`  Migration complete: ${totalRows} rows transferred`);
console.log(`═══════════════════════════════════════`);

// Verification
console.log('\n  Post-migration verification:');
for (const table of TABLES) {
  const result = await client.query(`SELECT COUNT(*) as cnt FROM "${table}"`);
  const sqliteCount = sqlite.prepare(`SELECT COUNT(*) as cnt FROM "${table}"`).get();
  const match = Number(result.rows[0].cnt) === sqliteCount.cnt ? '✓' : '✗';
  console.log(`  ${match} ${table}: PG=${result.rows[0].cnt} SQLite=${sqliteCount.cnt}`);
}

sqlite.close();
await client.end();
