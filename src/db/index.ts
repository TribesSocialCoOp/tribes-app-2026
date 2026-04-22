import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';
import path from 'path';
import { dbLogger } from '@/lib/logger';

/**
 * Local-First Database with Cloud Sync
 *
 * Architecture:
 * - Local reads hit the embedded SQLite replica (zero latency)
 * - Writes sync to the LibSQL primary (sqld container in prod, or hypervisor in dev)
 * - If the sync target is unreachable, operates in local-only mode gracefully
 *
 * Environment Variables:
 * - DATABASE_URL:        Local SQLite file path (e.g. "file:./tribes.db")
 * - TURSO_DATABASE_URL:  Remote LibSQL sync endpoint (e.g. "http://sqld:8080" in Docker)
 * - TURSO_AUTH_TOKEN:    (Optional) Auth token for sqld auth enforcement
 */

const localDbPath = process.env.DATABASE_URL || `file:${path.join(process.cwd(), 'tribes.db')}`;
const syncUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

// Create the LibSQL client with embedded replica + sync when available.
// Falls back to local-only if the sync target is unreachable or WAL index is missing.
function createDbClient() {
  if (syncUrl) {
    try {
      dbLogger.info({ syncUrl }, 'DB connecting with sync client');
      return createClient({
        url: localDbPath,
        syncUrl,
        authToken: authToken || undefined,
        syncInterval: 30,   // Sync every 30s in production (was 60s)
      });
    } catch (err) {
      dbLogger.warn({ err: (err as Error).message }, 'Sync client failed — falling back to local-only');
    }
  }
  dbLogger.info({ mode: syncUrl ? 'local-only' : 'sync-failed' }, 'DB running in local-only mode');
  return createClient({ url: localDbPath });
}

const client = createDbClient();

export const db = drizzle(client, { schema });

export type Database = typeof db;

// Export for manual sync triggers (e.g., after critical writes)
export async function syncDatabase() {
  if (syncUrl && 'sync' in client) {
    try {
      await (client as unknown as { sync: () => Promise<void> }).sync();
      dbLogger.info('Synced to remote LibSQL');
    } catch (err) {
      dbLogger.warn({ err }, 'Sync failed (operating local-only)');
    }
  }
}
