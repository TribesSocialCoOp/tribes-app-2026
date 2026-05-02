/**
 * Bond Tap Redemption Page
 * Phase 2E: /bond/tap/[token] — handles NFC/QR bond acceptance
 */

import { redirect } from 'next/navigation';
import { getCurrentUserId } from '@/lib/auth/session';
import { validateTapToken, redeemTapToken } from '@/lib/services/bond-tap-service';
import { revalidatePath } from 'next/cache';

interface TapRedemptionPageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ invite?: string; [key: string]: string | string[] | undefined }>;
}

export default async function TapRedemptionPage({ params, searchParams }: TapRedemptionPageProps) {
  const { token } = await params;
  const { invite } = await searchParams;
  const decodedToken = decodeURIComponent(token);

  // Check auth — redirect to login/signup if not authenticated
  // Preserve the invite code through the auth flow so new users
  // aren't blocked by the invite-only gate.
  const userId = await getCurrentUserId();
  if (!userId) {
    const returnPath = invite
      ? `/bond/tap/${token}?invite=${encodeURIComponent(invite)}`
      : `/bond/tap/${token}`;
    const loginUrl = `/signup?returnTo=${encodeURIComponent(returnPath)}${invite ? `&invite=${encodeURIComponent(invite)}` : ''}`;
    redirect(loginUrl);
  }

  // Validate the token
  let tokenInfo: Awaited<ReturnType<typeof validateTapToken>> | undefined;
  let error: string | null = null;

  try {
    tokenInfo = await validateTapToken(decodedToken);
  } catch (err: unknown) {
    error = ((err instanceof Error) ? err.message : 'An error occurred');
  }

  // Server action for accepting the bond
  async function acceptBond() {
    'use server';
    const uid = await getCurrentUserId();
    if (!uid) redirect('/login');

    try {
      await redeemTapToken(decodedToken, uid);
      revalidatePath('/bonds');
      redirect('/bonds');
    } catch {
      redirect('/bonds?error=tap-failed');
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <div className="mx-4 max-w-md rounded-2xl border border-red-500/20 bg-gray-900/80 p-8 text-center backdrop-blur-lg">
          <div className="mb-4 text-5xl">❌</div>
          <h1 className="mb-2 text-xl font-bold text-white">Bond Link Invalid</h1>
          <p className="mb-6 text-gray-400">{error}</p>
          <a
            href="/bonds"
            className="inline-block rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-3 font-medium text-white transition-all hover:scale-105"
          >
            Go to Bonds
          </a>
        </div>
      </div>
    );
  }

  if (!tokenInfo) return null;

  // Check if user is trying to bond with themselves
  const isSelf = tokenInfo.initiatorId === userId;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900">
      <div className="mx-4 max-w-md rounded-2xl border border-purple-500/20 bg-gray-900/80 p-8 text-center backdrop-blur-lg">
        {/* Bond Icon */}
        <div className="mb-6 text-6xl">🤝</div>

        {/* Initiator Info */}
        <h1 className="mb-2 text-2xl font-bold text-white">Bond Invitation</h1>
        <div className="mb-6 flex items-center justify-center gap-3">
          {tokenInfo.initiatorAvatar ? (
            <img
              src={tokenInfo.initiatorAvatar}
              alt={tokenInfo.initiatorName}
              className="h-12 w-12 rounded-full border-2 border-purple-500"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/30 text-xl font-bold text-purple-300">
              {tokenInfo.initiatorName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="text-left">
            <div className="font-semibold text-white">{tokenInfo.initiatorName}</div>
            <div className="text-sm text-gray-400">
              wants to connect with you
            </div>
          </div>
        </div>

        {/* Bond Type Badge */}
        <div className="mb-6 inline-block rounded-full bg-purple-500/20 px-4 py-2 text-sm font-medium text-purple-300">
          {tokenInfo.bondType === 'person' && '🤝 Person Bond (180-day passkey)'}
          {tokenInfo.bondType === 'tribe' && '👥 Tribe Bond'}
          {tokenInfo.bondType === 'event' && '🎫 Event Pass'}
        </div>

        {isSelf ? (
          <div className="mb-6 rounded-lg bg-yellow-500/10 p-4">
            <p className="text-sm text-yellow-400">
              You can&apos;t bond with yourself! Share this link with someone else.
            </p>
          </div>
        ) : (
          <form action={acceptBond}>
            <button
              type="submit"
              className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-purple-500/25 transition-all hover:scale-105 hover:shadow-xl hover:shadow-purple-500/30 active:scale-95"
            >
              Accept Bond
            </button>
          </form>
        )}

        {/* Expiry Notice */}
        <p className="mt-4 text-xs text-gray-500">
          This link expires at {tokenInfo.expiresAt.toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}
