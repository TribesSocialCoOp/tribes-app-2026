import { redirect } from 'next/navigation';

/**
 * Legacy route. The bond chat thread moved to /chat/[bondId]; this redirect
 * keeps old notification deep-links and bookmarks working.
 */
export default async function LegacyBondThreadRedirect({
  params,
}: {
  params: Promise<{ bondId: string }>;
}) {
  const { bondId } = await params;
  redirect(`/chat/${bondId}`);
}
