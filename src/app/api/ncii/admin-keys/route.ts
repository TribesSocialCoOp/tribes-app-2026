import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq, and, isNotNull } from 'drizzle-orm';
import { getClientIp, nciiAdminKeysLimiter } from '@/lib/auth/rate-limit';

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request.headers);
    try {
      await nciiAdminKeysLimiter.check(ip);
    } catch (limitErr: any) {
      return NextResponse.json({ error: limitErr.message }, { status: 429 });
    }

    const activeAdmins = await db
      .select({
        id: users.id,
        publicKey: users.encryptionPublicKey,
      })
      .from(users)
      .where(and(eq(users.role, 'Admin'), isNotNull(users.encryptionPublicKey)));

    const admins = activeAdmins.map((admin) => ({
      id: admin.id,
      publicKey: JSON.parse(admin.publicKey!),
    }));

    return NextResponse.json({ admins });
  } catch (err: unknown) {
    console.error('[api/ncii/admin-keys] Error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
