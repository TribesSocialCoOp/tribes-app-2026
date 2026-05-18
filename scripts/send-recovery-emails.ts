import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { sendEmail } from '../src/lib/services/email-service';

// Founding member invite code provided by user
const RECOVERY_INVITE_CODE = 'TRIBE-W4P6-CMNQ';

async function run() {
  const dryRun = process.env.DRY_RUN !== 'false';
  console.log(`[recovery] Starting recovery email run. Dry run: ${dryRun}`);

  // Query orphaned users (those without credentials AND without oauth accounts)
  // Filter: only real users created after app launch, not seed/test accounts
  const result = await db.execute(sql`
    SELECT id, name, email, created_at
    FROM users
    WHERE id NOT IN (SELECT user_id FROM credentials)
      AND id NOT IN (SELECT user_id FROM oauth_accounts)
      AND email NOT LIKE '%@example.com'
    ORDER BY created_at ASC;
  `);

  const orphanedUsers = result.rows as unknown as Array<{
    id: string;
    name: string;
    email: string;
    created_at: string;
  }>;

  console.log(`[recovery] Found ${orphanedUsers.length} orphaned registrations:`);
  for (const u of orphanedUsers) {
    console.log(` - ${u.name} <${u.email}> (Created: ${u.created_at})`);
  }

  if (orphanedUsers.length === 0) {
    console.log('[recovery] No orphaned users found. Nothing to do!');
    return;
  }

  if (dryRun) {
    console.log('\n[recovery] === DRY RUN ONLY ===');
    console.log('[recovery] To execute real sends, run with: DRY_RUN=false tsx scripts/send-recovery-emails.ts\n');
  }

  let successCount = 0;
  let failCount = 0;

  for (const user of orphanedUsers) {
    const inviteUrl = `https://tribes.app/signup?invite=${RECOVERY_INVITE_CODE}`;
    
    const subject = 'Complete your Tribes registration (Founding Member access)';
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6; color: #111;">
        <h2 style="color: #6366f1; font-size: 24px; margin-bottom: 20px;">Welcome back to Tribes!</h2>
        <p>Hi ${user.name},</p>
        <p>We noticed you recently started setting up your Tribes account but weren't able to complete the passkey creation step.</p>
        <p>Because some privacy-focused browsers block biometric passkey registration by default, we've upgraded the signup flow to support a smooth fallback to Google/Apple sign-in if your browser isn't fully compatible.</p>
        <p>We'd love to have you join us! Please try signing up again using this premium Founding Member invite code:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-family: monospace; font-size: 22px; font-weight: bold; background-color: #f3f4f6; color: #1f2937; padding: 12px 24px; border: 1px solid #e5e7eb; border-radius: 6px; letter-spacing: 1px;">
            ${RECOVERY_INVITE_CODE}
          </span>
        </div>

        <p>This code will grant you full Co-Op access. You can register using any browser, and if passkeys fail, simply click <strong>"Continue with Google"</strong> or <strong>"Continue with Apple"</strong> to finish setting up your profile instantly.</p>
        
        <div style="text-align: center; margin: 35px 0;">
          <a href="${inviteUrl}" style="background-color: #6366f1; color: white; text-decoration: none; padding: 14px 28px; font-weight: bold; border-radius: 6px; font-size: 16px; display: inline-block;">
            Finish Setting Up My Account
          </a>
        </div>
        
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
        <p style="font-size: 12px; color: #6b7280; text-align: center;">
          Tribes.app — Secure, local-first community identity.
        </p>
      </div>
    `;

    if (dryRun) {
      console.log(`[dry-run] Would send recovery email to: ${user.name} <${user.email}>`);
      successCount++;
    } else {
      try {
        console.log(`[recovery] Sending recovery email to: ${user.name} <${user.email}>...`);
        await sendEmail({
          to: user.email,
          subject,
          html,
        }, user.id);
        console.log(`[recovery] Successfully sent email to ${user.email}`);
        successCount++;
      } catch (err) {
        console.error(`[recovery] Failed to send email to ${user.email}:`, err);
        failCount++;
      }
    }
  }

  console.log(`\n[recovery] Run completed. Successfully processed: ${successCount}, Failed: ${failCount}`);
}

run().catch((err) => {
  console.error('[recovery] Fatal error running recovery campaign:', err);
  process.exit(1);
});
