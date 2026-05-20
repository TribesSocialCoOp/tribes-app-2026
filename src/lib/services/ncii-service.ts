import { db } from '@/db';
import { nciiReports, nciiHashBlocklist, nciiReportKeyGrants, posts, users, tribes } from '@/db/schema';
import { eq, and, or, gt } from 'drizzle-orm';
import { computePdqHash, pdqHammingDistance, pdqFromHex, PDQ_MATCH_THRESHOLD } from './pdq-hasher';

export interface NciiReportPayload {
  encrypted?: boolean;
  encryptedPayload?: string;
  encryptionIv?: string;
  keyGrants?: Array<{
    adminId: string;
    wrappedKey: string;
    wrapIv: string;
  }>;
  requesterName?: string;
  requesterEmail: string;
  requesterSignature?: string;
  isDepictedPerson: boolean;
  contentType: 'authentic_ncii' | 'deepfake' | 'minor';
  contentDescription?: string;
  contentUrls?: string[];
  posterUsername?: string;
  searchTerms?: string;
  nonConsentStatement: boolean;
}

export interface NciiReportStatus {
  trackingNumber: string;
  status: string;
  createdAt: Date | null;
  slaDeadline: Date;
  actionTaken: string | null;
  reviewedAt: Date | null;
}

/**
 * Tracking number generation:
 * Auto-increments sequentially within the current calendar year.
 * Uses retry logic to handle concurrent submissions safely.
 */
async function generateTrackingNumber(): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `NCII-${currentYear}-`;
  
  // Count only this year's submissions
  const rows = await db.select({ trackingNumber: nciiReports.trackingNumber }).from(nciiReports);
  const count = rows.filter(r => r.trackingNumber.startsWith(prefix)).length;
  
  const nextNum = String(count + 1).padStart(5, '0');
  return `${prefix}${nextNum}`;
}

/**
 * Submit a new NCII report.
 * Inserts the request into ncii_reports and fires confirmation emails.
 * Uses retry logic for tracking number generation to handle concurrent submissions.
 */
export async function submitNciiReport(payload: NciiReportPayload): Promise<{ trackingNumber: string; id: string }> {
  const hasUrls = payload.contentUrls && payload.contentUrls.length > 0;
  const hasUsername = payload.posterUsername && payload.posterUsername.trim().length > 0;
  const hasSearchTerms = payload.searchTerms && payload.searchTerms.trim().length > 0;
  if (!hasUrls && !hasUsername && !hasSearchTerms) {
    throw new Error('At least one content locator is required: URLs, poster username, or search terms.');
  }

  const id = `ncii-report-${crypto.randomUUID()}`;
  const now = new Date();
  const slaDeadline = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48-hour SLA deadline

  // Retry loop: if a concurrent submission grabs the same tracking number,
  // the UNIQUE constraint will reject us and we retry with the next number.
  const MAX_RETRIES = 5;
  let trackingNumber = '';
  let effectiveId = '';
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    trackingNumber = await generateTrackingNumber();
    effectiveId = attempt === 0 ? id : `ncii-report-${crypto.randomUUID()}`;
    try {
      await db.insert(nciiReports).values({
        id: effectiveId,
        trackingNumber,
        requesterName: payload.encrypted ? 'Encrypted Name' : payload.requesterName!,
        requesterEmail: payload.requesterEmail,
        requesterSignature: payload.encrypted ? 'Encrypted Signature' : payload.requesterSignature!,
        isDepictedPerson: payload.isDepictedPerson,
        contentType: payload.contentType,
        contentDescription: payload.encrypted ? 'Encrypted Description' : payload.contentDescription!,
        contentUrls: payload.contentUrls ? JSON.stringify(payload.contentUrls) : null,
        posterUsername: payload.posterUsername || null,
        searchTerms: payload.searchTerms || null,
        nonConsentStatement: payload.nonConsentStatement,
        status: 'pending',
        slaDeadline,
        createdAt: now,
        updatedAt: now,
        encryptedPayload: payload.encrypted ? payload.encryptedPayload : null,
        encryptionIv: payload.encrypted ? payload.encryptionIv : null,
      });

      // Insert key grants if encrypted
      if (payload.encrypted && payload.keyGrants) {
        for (const grant of payload.keyGrants) {
          await db.insert(nciiReportKeyGrants).values({
            id: `ncii-grant-${crypto.randomUUID()}`,
            reportId: effectiveId,
            adminId: grant.adminId,
            wrappedKey: grant.wrappedKey,
            wrapIv: grant.wrapIv,
            createdAt: now,
          });
        }
      }

      break; // Success — exit retry loop
    } catch (insertErr: any) {
      // Check for unique constraint violation (PostgreSQL error code 23505)
      const isUniqueViolation =
        insertErr?.code === '23505' ||
        insertErr?.message?.includes('unique') ||
        insertErr?.message?.includes('duplicate');
      if (isUniqueViolation && attempt < MAX_RETRIES - 1) {
        console.warn(`[NCII Service] Tracking number collision on ${trackingNumber}, retrying (attempt ${attempt + 1})`);
        continue;
      }
      throw insertErr; // Non-recoverable error or out of retries
    }
  }

  // Auto-resolve URLs to post IDs and pre-hash images (fire-and-forget)
  if (payload.contentUrls && payload.contentUrls.length > 0) {
    resolveContentUrlsToPostIds(payload.contentUrls)
      .then(async (postIds) => {
        if (postIds.length > 0) {
          // Store linked post IDs on the report
          await db.update(nciiReports)
            .set({ linkedPostIds: JSON.stringify(postIds) })
            .where(eq(nciiReports.id, effectiveId));

          // Pre-hash images in background
          await preHashReportedContent(effectiveId, postIds);
        }
      })
      .catch((err) => {
        console.error('[NCII Service] Background URL resolution/pre-hashing failed:', err);
      });
  }

  // Send confirmation email to the reporter
  try {
    const { nciiReportConfirmationEmail } = await import('./email-templates');
    const { sendEmail } = await import('./email-service');
    const emailContent = nciiReportConfirmationEmail({
      trackingNumber,
      requesterName: payload.encrypted ? 'Encrypted Name' : payload.requesterName!,
      requesterEmail: payload.requesterEmail,
      contentType: payload.contentType,
      contentDescription: payload.encrypted ? 'Encrypted Description' : payload.contentDescription!,
      slaDeadline,
    });
    await sendEmail({
      to: payload.requesterEmail,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });
  } catch (error) {
    console.error('[NCII Service] Failed to send confirmation email:', error);
  }

  // Notify admins
  try {
    const admins = await db.select().from(users).where(eq(users.role, 'Admin'));
    const { nciiReportAdminAlertEmail } = await import('./email-templates');
    const { sendEmail } = await import('./email-service');
    
    for (const admin of admins) {
      if (admin.email) {
        const emailContent = nciiReportAdminAlertEmail({
          trackingNumber,
          contentType: payload.contentType,
          slaDeadline,
          reportId: id,
        });
        await sendEmail({
          to: admin.email,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
        });
      }
    }
  } catch (error) {
    console.error('[NCII Service] Failed to notify admins:', error);
  }

  return { trackingNumber, id };
}

/**
 * Look up report status.
 */
export async function getNciiReportStatus(trackingNumber: string, email: string): Promise<NciiReportStatus | null> {
  const [report] = await db.select()
    .from(nciiReports)
    .where(and(
      eq(nciiReports.trackingNumber, trackingNumber),
      eq(nciiReports.requesterEmail, email)
    ))
    .limit(1);

  if (!report) return null;

  return {
    trackingNumber: report.trackingNumber,
    status: report.status,
    createdAt: report.createdAt,
    slaDeadline: report.slaDeadline,
    actionTaken: report.actionTaken,
    reviewedAt: report.reviewedAt,
  };
}

/**
 * Count dismissed/rejected reports from the same email in the last 30 days.
 * Returns the count for abuse flagging in the admin UI.
 */
export async function getReporterAbuseScore(email: string): Promise<number> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const dismissed = await db.select({ id: nciiReports.id })
    .from(nciiReports)
    .where(and(
      eq(nciiReports.requesterEmail, email),
      or(
        eq(nciiReports.actionTaken, 'not_ncii'),
        eq(nciiReports.actionTaken, 'content_not_found')
      ),
      gt(nciiReports.createdAt, thirtyDaysAgo)
    ));
  return dismissed.length;
}

/**
 * Admin: list all NCII reports, sorted by SLA deadline urgency.
 */
export async function getActiveNciiReports() {
  const reports = await db.select()
    .from(nciiReports)
    .orderBy(nciiReports.slaDeadline);

  const reportsWithHashes = await Promise.all(reports.map(async (report) => {
    let autoBlockedCount = 0;
    let confirmedCount = 0;
    let hasPreHashes = false;
    let posterUser: { id: string; username: string | null; name: string; slug: string | null } | null = null;
    let abuseScore = 0;
    let keyGrants: Array<{ adminId: string; wrappedKey: string; wrapIv: string }> = [];

    try {
      const hashes = await db.select({
        id: nciiHashBlocklist.id,
        status: nciiHashBlocklist.status
      })
      .from(nciiHashBlocklist)
      .where(eq(nciiHashBlocklist.sourceReportId, report.id));

      autoBlockedCount = hashes.filter(h => h.status === 'auto_blocked').length;
      confirmedCount = hashes.filter(h => h.status === 'confirmed').length;
      hasPreHashes = autoBlockedCount > 0;
    } catch (e) {
      console.error(`[NCII Service] Error counting hashes for report ${report.id}:`, e);
    }

    try {
      if (report.posterUsername) {
        const trimmed = report.posterUsername.trim();
        // Remove @ if reporter included it
        const cleanUsername = trimmed.startsWith('@') ? trimmed.substring(1) : trimmed;

        const [userMatch] = await db.select({
          id: users.id,
          username: users.username,
          name: users.name,
          slug: users.slug
        })
        .from(users)
        .where(or(
          eq(users.username, cleanUsername),
          eq(users.slug, cleanUsername)
        ))
        .limit(1);

        if (userMatch) {
          posterUser = userMatch;
        }
      }
    } catch (e) {
      console.error(`[NCII Service] Error looking up exact poster username for report ${report.id}:`, e);
    }

    try {
      abuseScore = await getReporterAbuseScore(report.requesterEmail);
    } catch (e) {
      console.error(`[NCII Service] Error fetching abuse score for email ${report.requesterEmail}:`, e);
    }

    try {
      keyGrants = await db.select({
        adminId: nciiReportKeyGrants.adminId,
        wrappedKey: nciiReportKeyGrants.wrappedKey,
        wrapIv: nciiReportKeyGrants.wrapIv,
      })
      .from(nciiReportKeyGrants)
      .where(eq(nciiReportKeyGrants.reportId, report.id));
    } catch (e) {
      console.error(`[NCII Service] Error fetching key grants for report ${report.id}:`, e);
    }

    return {
      ...report,
      autoBlockedCount,
      confirmedCount,
      hasPreHashes,
      posterUser,
      abuseScore,
      keyGrants,
    };
  }));

  return reportsWithHashes;
}

/**
 * Helper to download, hash, and store all images of a post in the blocklist.
 * Ensures DRY principles across administrative removal and background pre-hashing.
 */
async function hashAndStorePostImages(
  post: any,
  reportId: string,
  adminId: string | null,
  status: 'confirmed' | 'auto_blocked'
): Promise<boolean> {
  const urlsToHash = new Set<string>();
  if (post.imageUrl) urlsToHash.add(post.imageUrl);
  if (post.imageUrls && Array.isArray(post.imageUrls)) {
    post.imageUrls.forEach((url: string) => {
      if (typeof url === 'string') urlsToHash.add(url);
    });
  }

  let pdqHashesStored = false;
  const now = new Date();

  for (const url of urlsToHash) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const buffer = Buffer.from(await response.arrayBuffer());
      const hashRes = await computePdqHash(buffer);
      if (hashRes) {
        // Check if hash already exists in blocklist
        const [existing] = await db.select({ id: nciiHashBlocklist.id })
          .from(nciiHashBlocklist)
          .where(and(
            eq(nciiHashBlocklist.pdqHash, hashRes.hashHex),
            eq(nciiHashBlocklist.sourceReportId, reportId)
          ))
          .limit(1);

        if (!existing) {
          await db.insert(nciiHashBlocklist).values({
            id: `ncii-hash-${crypto.randomUUID()}`,
            pdqHash: hashRes.hashHex,
            sourceReportId: reportId,
            sourcePostId: post.id,
            addedBy: adminId,
            addedAt: now,
            status,
          });
        } else {
          // If resolving (confirmed) and it was previously auto_blocked, update it
          await db.update(nciiHashBlocklist)
            .set({
              status,
              addedBy: adminId,
              addedAt: now,
            })
            .where(eq(nciiHashBlocklist.id, existing.id));
        }
        pdqHashesStored = true;
      }
    } catch (e) {
      console.error(`[NCII Service] Failed to hash image at ${url}:`, e);
    }
  }

  return pdqHashesStored;
}

/**
 * Admin: resolve an NCII report.
 * If removing content: calls removePost, hashes removed images via PDQ, stores in blocklist, and emails reporter.
 */
export async function resolveNciiReport(
  reportId: string,
  adminId: string,
  action: 'content_removed' | 'content_not_found' | 'insufficient_info' | 'not_ncii',
  actionNotes?: string
): Promise<void> {
  const [report] = await db.select().from(nciiReports).where(eq(nciiReports.id, reportId)).limit(1);
  if (!report) throw new Error('Report not found');

  let status: 'pending' | 'in_review' | 'removed' | 'rejected' | 'requires_info' = 'rejected';
  if (action === 'content_removed') {
    status = 'removed';
  } else if (action === 'insufficient_info') {
    status = 'requires_info';
  }

  const now = new Date();
  let pdqHashesStored = false;

  if (action === 'content_removed') {
    // Promote existing auto_blocked hashes associated with this report to confirmed status
    try {
      await db.update(nciiHashBlocklist)
        .set({
          status: 'confirmed',
          addedBy: adminId,
          addedAt: now,
        })
        .where(and(
          eq(nciiHashBlocklist.sourceReportId, reportId),
          eq(nciiHashBlocklist.status, 'auto_blocked')
        ));
      pdqHashesStored = true;
    } catch (e) {
      console.error('[NCII Service] Error promoting auto_blocked hashes:', e);
    }

    if (report.linkedPostIds) {
      try {
        const postIds: string[] = JSON.parse(report.linkedPostIds);
        const { removePost } = await import('./moderation-service');
        
        for (const postId of postIds) {
          const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
          if (post) {
            const stored = await hashAndStorePostImages(post, reportId, adminId, 'confirmed');
            if (stored) {
              pdqHashesStored = true;
            }

            // Call removePost from moderation-service
            await removePost({
              postId,
              reason: `NCII Takedown Request ${report.trackingNumber}`,
              preventRepost: true,
            });
          }
        }
      } catch (e) {
        console.error('[NCII Service] Error during content removal / hashing:', e);
      }
    }
  } else {
    // Delete any temporary auto_blocked hashes associated with this report
    try {
      await db.delete(nciiHashBlocklist)
        .where(and(
          eq(nciiHashBlocklist.sourceReportId, reportId),
          eq(nciiHashBlocklist.status, 'auto_blocked')
        ));
    } catch (e) {
      console.error('[NCII Service] Error deleting auto_blocked hashes:', e);
    }
  }

  // Double check if we have any confirmed hashes stored in the blocklist for this report
  try {
    const [anyHash] = await db.select({ id: nciiHashBlocklist.id })
      .from(nciiHashBlocklist)
      .where(and(
        eq(nciiHashBlocklist.sourceReportId, reportId),
        eq(nciiHashBlocklist.status, 'confirmed')
      ))
      .limit(1);
    if (anyHash) {
      pdqHashesStored = true;
    }
  } catch (e) {
    console.error('[NCII Service] Error checking confirmed hashes count:', e);
  }

  // Update report in database
  await db.update(nciiReports).set({
    status,
    reviewedBy: adminId,
    reviewedAt: now,
    actionTaken: action,
    actionNotes: actionNotes || null,
    pdqHashesStored,
    updatedAt: now,
  }).where(eq(nciiReports.id, reportId));

  // Send status update email to requester
  try {
    const { nciiReportStatusUpdateEmail } = await import('./email-templates');
    const { sendEmail } = await import('./email-service');
    const emailContent = nciiReportStatusUpdateEmail({
      trackingNumber: report.trackingNumber,
      status,
      actionTaken: action,
      actionNotes: actionNotes,
    });
    await sendEmail({
      to: report.requesterEmail,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });
  } catch (error) {
    console.error('[NCII Service] Failed to send status update email:', error);
  }
}

/**
 * Scan an uploaded image buffer against the NCII perceptual hash blocklist.
 * Returns both the block status and whether the match was auto_blocked (pending review)
 * or confirmed (admin-verified) for logging/transparency.
 */
export async function scanForNciiBlocklist(
  buffer: Buffer,
  filename: string
): Promise<{ isBlocked: boolean; matchedHash?: string; matchStatus?: string }> {
  try {
    const computed = await computePdqHash(buffer);
    if (!computed) {
      return { isBlocked: false };
    }

    const blocklistRows = await db.select().from(nciiHashBlocklist);
    for (const row of blocklistRows) {
      const blockBin = await pdqFromHex(row.pdqHash);
      const dist = await pdqHammingDistance(computed.hash, blockBin);
      if (dist <= PDQ_MATCH_THRESHOLD) {
        return { isBlocked: true, matchedHash: row.pdqHash, matchStatus: row.status };
      }
    }
  } catch (error) {
    console.error('[NCII Service] Failed to scan against blocklist:', error);
  }
  return { isBlocked: false };
}

/**
 * Resolve reported content URLs to internal post IDs.
 * Supports formats:
 *   - https://tribes.app/t/{tribeSlug}/{postSlug}
 *   - https://tribes.app/post/{postId}
 *   - https://tribes.app/p/{postId}  (short links)
 *   - Raw post IDs (UUID format)
 */
export async function resolveContentUrlsToPostIds(contentUrls: string[]): Promise<string[]> {
  const postIds = new Set<string>();

  for (const rawUrl of contentUrls) {
    const trimmed = rawUrl.trim();
    if (!trimmed) continue;

    // Try UUID extraction (raw post ID or embedded in URL path)
    const uuidMatch = trimmed.match(
      /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
    );
    if (uuidMatch) {
      // Verify post exists
      const [exists] = await db.select({ id: posts.id })
        .from(posts).where(eq(posts.id, uuidMatch[1])).limit(1);
      if (exists) {
        postIds.add(exists.id);
        continue;
      }
    }

    // Try slug-based resolution: /t/{tribeSlug}/{postSlug}
    try {
      let parsedUrl: URL;
      if (trimmed.startsWith('/') || !trimmed.includes('://')) {
        parsedUrl = new URL(trimmed, 'https://tribes.app');
      } else {
        parsedUrl = new URL(trimmed);
      }
      const segments = parsedUrl.pathname.split('/').filter(Boolean);

      if (segments[0] === 't' && segments.length >= 3) {
        const tribeSlug = segments[1];
        const postSlug = segments[2];
        const [match] = await db.select({ id: posts.id })
          .from(posts)
          .innerJoin(tribes, eq(posts.tribeId, tribes.id))
          .where(and(eq(tribes.slug, tribeSlug), eq(posts.slug, postSlug)))
          .limit(1);
        if (match) postIds.add(match.id);
      } else if ((segments[0] === 'post' || segments[0] === 'p') && segments.length >= 2) {
        const potentialId = segments[1];
        const [match] = await db.select({ id: posts.id })
          .from(posts)
          .where(eq(posts.id, potentialId))
          .limit(1);
        if (match) postIds.add(match.id);
      }
    } catch {
      // Not a valid URL — skip
    }
  }

  return Array.from(postIds);
}

/**
 * Background pre-hashing: fetch images from resolved posts and add
 * their PDQ hashes to the blocklist with 'auto_blocked' status.
 * Runs fire-and-forget after report insertion — errors are logged but
 * don't fail the submission.
 */
export async function preHashReportedContent(
  reportId: string,
  postIds: string[]
): Promise<void> {
  for (const postId of postIds) {
    const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
    if (!post) continue;
    await hashAndStorePostImages(post, reportId, null, 'auto_blocked');
  }
}
