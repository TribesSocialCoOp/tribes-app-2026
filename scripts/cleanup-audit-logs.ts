
import { db } from '@/db';
import { adminAuditLogs } from '@/db/schema';
import { lt } from 'drizzle-orm';

/**
 * Maintenance Script: Admin Audit Log Cycling
 * 
 * Purges admin_audit_logs older than 90 days to preserve database space.
 * Run via cron: tsx scripts/cleanup-audit-logs.ts
 */

const DRY_RUN = process.argv.includes('--dry-run');
const DAYS_TO_KEEP = 90;

async function main() {
  console.log(`🧹 Starting Admin Audit Log Cleanup ${DRY_RUN ? '(DRY RUN)' : ''}`);
  
  const cutOffDate = new Date();
  cutOffDate.setDate(cutOffDate.getDate() - DAYS_TO_KEEP);
  
  console.log(`🔍 Searching for logs older than ${DAYS_TO_KEEP} days (before ${cutOffDate.toISOString()})...`);

  // Fetch count of matching records
  const oldLogs = await db.select({ id: adminAuditLogs.id })
    .from(adminAuditLogs)
    .where(lt(adminAuditLogs.createdAt, cutOffDate));

  console.log(`🔍 Found ${oldLogs.length} log entries to purge.`);

  if (oldLogs.length === 0) {
    console.log('✅ No logs to purge. Exiting.');
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would have deleted ${oldLogs.length} records.`);
  } else {
    try {
      await db.delete(adminAuditLogs)
        .where(lt(adminAuditLogs.createdAt, cutOffDate));
      console.log(`✅ Successfully purged ${oldLogs.length} audit log entries.`);
    } catch (err: any) {
      console.error('❌ Failed to purge logs:', err.message);
      process.exit(1);
    }
  }
  
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
