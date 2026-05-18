import { redirect } from 'next/navigation';
import { getCurrentUserId } from '@/lib/auth/session';

export default async function RootPage() {
  const userId = await getCurrentUserId();
  if (userId) {
    redirect('/your-comms');
  } else {
    redirect('/tribes');
  }
}
