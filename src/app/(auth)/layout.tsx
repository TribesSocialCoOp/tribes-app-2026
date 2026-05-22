/**
 * Auth pages layout — forces dynamic rendering.
 *
 * Without this, Next.js statically prerenders login/signup/forgot-password
 * with s-maxage=31536000 (1 year ISR cache). After a deploy, the ISR cache
 * serves stale HTML with old server action IDs baked in, causing
 * "Failed to find Server Action" errors on passkey/form submissions.
 *
 * All auth pages are inherently dynamic (session-dependent, CSRF tokens,
 * ALTCHA challenges) and must never be served from stale cache.
 */
export const dynamic = 'force-dynamic';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
