import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock State ──────────────────────────────────────────────────────
let mockNciiReports: any[] = [];
let mockHashBlocklist: any[] = [];
let mockInsertCalls: any[] = [];
let mockUpdateCalls: any[] = [];
let mockSendEmailCalls: any[] = [];
let mockAdmins: any[] = [{ id: 'admin-abc', email: 'admin@tribes.app', role: 'Admin' }];

vi.mock('@/db', () => {
  const makeQuery = (result: any) => {
    const limitObj = {
      then: (resolve: any) => Promise.resolve(result).then(resolve),
      catch: (reject: any) => Promise.resolve(result).catch(reject),
    };
    const whereObj = {
      limit: vi.fn(() => limitObj),
      then: (resolve: any) => Promise.resolve(result).then(resolve),
      catch: (reject: any) => Promise.resolve(result).catch(reject),
    };
    const orderByObj = {
      then: (resolve: any) => Promise.resolve(result).then(resolve),
      catch: (reject: any) => Promise.resolve(result).catch(reject),
    };
    const fromObj = {
      where: vi.fn(() => whereObj),
      orderBy: vi.fn(() => orderByObj),
      then: (resolve: any) => Promise.resolve(result).then(resolve),
      catch: (reject: any) => Promise.resolve(result).catch(reject),
    };
    return fromObj;
  };

  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn((table: any) => {
          const tableName = table?._name ?? '';
          const result = tableName === 'ncii_reports'
            ? mockNciiReports
            : tableName === 'ncii_hash_blocklist'
            ? mockHashBlocklist
            : tableName === 'users'
            ? mockAdmins
            : [];
          return makeQuery(result);
        }),
      })),
      insert: vi.fn((table: any) => ({
        values: vi.fn((vals: any) => {
          mockInsertCalls.push({ table: table?._name ?? 'unknown', values: vals });
          return Promise.resolve();
        }),
      })),
      update: vi.fn((table: any) => ({
        set: vi.fn((setObj: any) => ({
          where: vi.fn(() => {
            mockUpdateCalls.push({ table: table?._name ?? 'unknown', set: setObj });
            return Promise.resolve();
          }),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    },
  };
});

vi.mock('@/db/schema', () => ({
  nciiReports: { id: 'id', trackingNumber: 'trackingNumber', requesterEmail: 'requesterEmail', _name: 'ncii_reports' },
  nciiHashBlocklist: { id: 'id', pdqHash: 'pdqHash', _name: 'ncii_hash_blocklist' },
  nciiReportKeyGrants: { id: 'id', reportId: 'reportId', adminId: 'adminId', _name: 'ncii_report_key_grants' },
  posts: { id: 'id', imageUrl: 'imageUrl', imageUrls: 'imageUrls', _name: 'posts' },
  users: { id: 'id', role: 'role', email: 'email', _name: 'users' },
  tribes: { id: 'id', slug: 'slug', _name: 'tribes' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
  or: vi.fn(() => 'or'),
  gt: vi.fn(() => 'gt'),
  isNull: vi.fn(() => 'isNull'),
}));

vi.mock('../services/pdq-hasher', () => ({
  computePdqHash: vi.fn(() => Promise.resolve({ hashHex: 'abc123hash', hash: new Uint8Array([1, 2, 3]) })),
  pdqHammingDistance: vi.fn(() => Promise.resolve(0)), // 0 distance = exact match
  pdqFromHex: vi.fn(() => Promise.resolve(new Uint8Array([1, 2, 3]))),
  PDQ_MATCH_THRESHOLD: 31,
}));

vi.mock('../services/email-service', () => ({
  sendEmail: vi.fn((opts: any) => {
    mockSendEmailCalls.push(opts);
    return Promise.resolve();
  }),
}));

vi.mock('../services/email-templates', () => ({
  nciiReportConfirmationEmail: vi.fn((opts: any) => ({
    subject: `NCII Intake Confirmed: ${opts.trackingNumber}`,
    html: `<p>Intake confirmed for ${opts.requesterName}</p>`,
    text: `Intake confirmed for ${opts.requesterName}`,
  })),
  nciiReportStatusUpdateEmail: vi.fn((opts: any) => ({
    subject: `NCII Report Status Update: ${opts.trackingNumber}`,
    html: `<p>Status is ${opts.status}</p>`,
    text: `Status is ${opts.status}`,
  })),
  nciiReportAdminAlertEmail: vi.fn((opts: any) => ({
    subject: `URGENT NCII Takedown: ${opts.trackingNumber}`,
    html: `<p>Expedited processing required.</p>`,
    text: `Expedited processing required.`,
  })),
}));

// ── Import Under Test ───────────────────────────────────────────────
import {
  submitNciiReport,
  getNciiReportStatus,
  scanForNciiBlocklist,
} from '../services/ncii-service';

describe('NCII Compliance Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNciiReports = [];
    mockHashBlocklist = [];
    mockInsertCalls = [];
    mockUpdateCalls = [];
    mockSendEmailCalls = [];
  });

  describe('submitNciiReport', () => {
    it('successfully registers an NCII intake report and triggers notifications', async () => {
      mockNciiReports = [];
      const payload = {
        requesterName: 'Victim Name',
        requesterEmail: 'victim@domain.com',
        requesterSignature: 'Victim Name Signature',
        isDepictedPerson: true,
        contentType: 'authentic_ncii' as const,
        contentDescription: 'Detailed description of private content',
        contentUrls: ['https://tribes.app/posts/999'],
        posterUsername: 'spammer',
        searchTerms: '#leak',
        nonConsentStatement: true,
      };

      const result = await submitNciiReport(payload);
      const currentYear = new Date().getFullYear();
      
      expect(result.trackingNumber).toBe(`NCII-${currentYear}-00001`);
      expect(result.id).toContain('ncii-report-');

      // Verify DB insertion
      expect(mockInsertCalls).toHaveLength(1);
      const insertCall = mockInsertCalls[0];
      expect(insertCall.table).toBe('ncii_reports');
      expect(insertCall.values.requesterEmail).toBe('victim@domain.com');
      expect(insertCall.values.contentType).toBe('authentic_ncii');
      expect(insertCall.values.status).toBe('pending');
      expect(insertCall.values.slaDeadline).toBeInstanceOf(Date);

      // Verify SLA is set to ~48 hours
      const now = Date.now();
      const slaTime = insertCall.values.slaDeadline.getTime();
      const hoursDiff = (slaTime - now) / (1000 * 60 * 60);
      expect(hoursDiff).toBeGreaterThan(47.5);
      expect(hoursDiff).toBeLessThan(48.5);

      // Verify emails were sent (1 to requester, 1 to admin)
      expect(mockSendEmailCalls).toHaveLength(2);
      
      const requesterMail = mockSendEmailCalls.find(m => m.to === 'victim@domain.com');
      expect(requesterMail).toBeDefined();
      expect(requesterMail.subject).toContain(`NCII Intake Confirmed: NCII-${currentYear}-00001`);

      const adminMail = mockSendEmailCalls.find(m => m.to === 'admin@tribes.app');
      expect(adminMail).toBeDefined();
      expect(adminMail.subject).toContain(`URGENT NCII Takedown: NCII-${currentYear}-00001`);
    });

    it('rejects submission when no locator is provided', async () => {
      const payload = {
        requesterName: 'Victim Name',
        requesterEmail: 'victim@domain.com',
        requesterSignature: 'Victim Name Signature',
        isDepictedPerson: true,
        contentType: 'authentic_ncii' as const,
        contentDescription: 'Detailed description of private content',
        contentUrls: [],
        posterUsername: '',
        searchTerms: '',
        nonConsentStatement: true,
      };

      await expect(submitNciiReport(payload)).rejects.toThrow('At least one content locator is required');
    });

    it('accepts submission when only posterUsername is provided', async () => {
      const payload = {
        requesterName: 'Victim Name',
        requesterEmail: 'victim@domain.com',
        requesterSignature: 'Victim Name Signature',
        isDepictedPerson: true,
        contentType: 'authentic_ncii' as const,
        contentDescription: 'Detailed description of private content',
        posterUsername: 'spammer',
        nonConsentStatement: true,
      };

      const result = await submitNciiReport(payload);
      expect(result.trackingNumber).toBeDefined();
    });

    it('stores encrypted payload and creates key grants when encrypted payload is submitted', async () => {
      const payload = {
        encrypted: true,
        encryptedPayload: 'AES_ENCRYPTED_DATA_BASE64',
        encryptionIv: 'AES_IV_BASE64',
        keyGrants: [
          {
            adminId: 'admin-abc',
            wrappedKey: 'WRAPPED_AES_KEY_BASE64',
            wrapIv: 'WRAP_IV_BASE64',
          }
        ],
        requesterEmail: 'victim@domain.com',
        isDepictedPerson: true,
        contentType: 'authentic_ncii' as const,
        posterUsername: 'spammer',
        nonConsentStatement: true,
      };

      const result = await submitNciiReport(payload);
      expect(result.trackingNumber).toBeDefined();

      // Verify that ncii_reports insertion includes the encrypted fields and fallback text
      const reportInsert = mockInsertCalls.find(c => c.table === 'ncii_reports');
      expect(reportInsert).toBeDefined();
      expect(reportInsert.values.encryptedPayload).toBe('AES_ENCRYPTED_DATA_BASE64');
      expect(reportInsert.values.encryptionIv).toBe('AES_IV_BASE64');
      expect(reportInsert.values.requesterName).toBe('Encrypted Name');
      expect(reportInsert.values.requesterSignature).toBe('Encrypted Signature');
      expect(reportInsert.values.contentDescription).toBe('Encrypted Description');

      // Verify that key grants are inserted
      const grantInsert = mockInsertCalls.find(c => c.table === 'ncii_report_key_grants');
      expect(grantInsert).toBeDefined();
      expect(grantInsert.values.adminId).toBe('admin-abc');
      expect(grantInsert.values.wrappedKey).toBe('WRAPPED_AES_KEY_BASE64');
      expect(grantInsert.values.wrapIv).toBe('WRAP_IV_BASE64');
    });
  });

  describe('getNciiReportStatus', () => {
    it('retrieves the correct status for a tracking number + email combo', async () => {
      const currentYear = new Date().getFullYear();
      const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000);
      
      mockNciiReports = [{
        trackingNumber: `NCII-${currentYear}-00005`,
        requesterEmail: 'victim@domain.com',
        status: 'in_review',
        createdAt: new Date(),
        slaDeadline: deadline,
        actionTaken: null,
        reviewedAt: null,
      }];

      const status = await getNciiReportStatus(`NCII-${currentYear}-00005`, 'victim@domain.com');
      expect(status).not.toBeNull();
      expect(status!.status).toBe('in_review');
      expect(status!.trackingNumber).toBe(`NCII-${currentYear}-00005`);
      expect(status!.slaDeadline).toBe(deadline);
    });

    it('returns null if report is not found', async () => {
      mockNciiReports = [];
      const status = await getNciiReportStatus('INVALID-TRK', 'victim@domain.com');
      expect(status).toBeNull();
    });
  });

  describe('scanForNciiBlocklist', () => {
    it('blocks uploads if they match perceptual hashes on the blocklist', async () => {
      mockHashBlocklist = [{
        pdqHash: 'abc123hash',
      }];

      const buffer = Buffer.from('simulated-intimate-image-data');
      const scan = await scanForNciiBlocklist(buffer, 'intimate.png');
      
      expect(scan.isBlocked).toBe(true);
      expect(scan.matchedHash).toBe('abc123hash');
    });

    it('allows uploads if hashes do not match the blocklist', async () => {
      mockHashBlocklist = [{
        pdqHash: 'totally-different-hash-456',
      }];

      // Mock Hamming distance to return large value (no match)
      const hasher = await import('../services/pdq-hasher');
      // @ts-ignore
      hasher.pdqHammingDistance.mockResolvedValueOnce(50); // > 31 threshold

      const buffer = Buffer.from('regular-user-image');
      const scan = await scanForNciiBlocklist(buffer, 'regular.png');
      
      expect(scan.isBlocked).toBe(false);
    });
  });
});
