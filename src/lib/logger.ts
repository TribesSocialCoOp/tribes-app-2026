/**
 * @fileoverview Structured Logging (Pino)
 *
 * JSON output in production (parseable by log aggregators, docker logs, etc.)
 * Human-readable pretty output in development.
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   import { dbLogger } from '@/lib/logger';
 *
 *   logger.info('Server started');
 *   dbLogger.warn({ err }, 'Sync failed, falling back to local-only');
 *
 * Log levels: trace < debug < info < warn < error < fatal
 * Set via LOG_LEVEL env var. Default: 'info'.
 */

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';
const level = process.env.LOG_LEVEL || 'info';

export const logger = pino({
  level,
  // In production: raw JSON to stdout (Docker captures it)
  // In dev: pretty-printed with colors
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }
    : {
        // Structured fields added to every log line in production
        base: {
          env: process.env.NODE_ENV,
          service: 'tribes-app',
        },
        // ISO timestamp for log aggregators
        timestamp: pino.stdTimeFunctions.isoTime,
      }),
});

// ── Module-specific child loggers ──────────────────────────
// Use these in their respective service files for easy filtering:
//   docker compose logs app 2>&1 | grep '"module":"db"'

export const dbLogger    = logger.child({ module: 'db' });
export const authLogger  = logger.child({ module: 'auth' });
export const emailLogger = logger.child({ module: 'email' });
export const stripeLogger = logger.child({ module: 'stripe' });
export const s3Logger    = logger.child({ module: 's3' });
export const csamLogger  = logger.child({ module: 'csam' });
export const wsLogger    = logger.child({ module: 'ws-relay' });
