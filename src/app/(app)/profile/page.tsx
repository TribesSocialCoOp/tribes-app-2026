
import { redirect } from 'next/navigation';

export default function ProfilePage() {
  // The profile page has been merged into the more comprehensive settings page.
  redirect('/settings');
  return null; 
}
