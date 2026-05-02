
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { dbLogger } from '@/lib/logger';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  dbLogger.error({ err: err.message }, 'Unexpected PG pool error');
});

dbLogger.info('DB pool initialized (PostgreSQL)');

export const db = drizzle(pool, { schema });
export type Database = typeof db;
