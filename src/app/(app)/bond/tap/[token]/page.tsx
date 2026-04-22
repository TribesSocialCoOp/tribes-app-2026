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
}

export default async function TapRedemptionPage({ params }: TapRedemptionPageProps) {
  const { token } = await params;
  const decodedToken = decodeURIComponent(token);

  // Check auth — redirect to login if not authenticated
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect(`/login?returnTo=${encodeURIComponent(`/bond/tap/${token}`)}`);
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

      // Family bonds → redirect to introduce flow so the user can
      // introduce the new connection to existing family members
      if (tokenInfo?.bondType === 'family') {
        const name = encodeURIComponent(tokenInfo.initiatorName);
        const memberId = encodeURIComponent(tokenInfo.initiatorId);
        redirect(`/family/start?name=${name}&memberId=${memberId}`);
      }

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
              wants to form a <span className="font-medium text-purple-400">{tokenInfo.bondType}</span> bond
            </div>
          </div>
        </div>

        {/* Bond Type Badge */}
        <div className="mb-6 inline-block rounded-full bg-purple-500/20 px-4 py-2 text-sm font-medium text-purple-300">
          {tokenInfo.bondType === 'family' && '👨‍👩‍👦 Family Bond (365-day passkey)'}
          {tokenInfo.bondType === 'friend' && '🤝 Friend Bond (30-day passkey)'}
          {tokenInfo.bondType === 'professional' && '💼 Professional Bond (30-day passkey)'}
          {tokenInfo.bondType === 'collaborator' && '🔧 Collaborator Bond (30-day passkey)'}
          {tokenInfo.bondType === 'follower' && '👤 Follower Bond'}
          {tokenInfo.bondType === 'supporter' && '💎 Supporter Bond'}
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
