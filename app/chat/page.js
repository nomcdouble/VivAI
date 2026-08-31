import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import ChatApp from '../../components/ChatApp';

export default async function ChatPage({ searchParams }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // /chat never claims a seat itself — it only checks whether this user
  // already holds one. Anyone without an active seat (including a fresh
  // login or a direct hit on /chat's URL) gets funneled through /waiting,
  // which is the only place seats are actually granted/queued.
  const { data: session } = await supabase
    .from('app_sessions')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();

  // /chat is never a valid entry point by itself. The only way in is via the
  // redirect /waiting performs once a seat is confirmed active (it tags the
  // redirect with ?seated=1). A direct hit, a bookmark, a stale/refreshed
  // tab, a login-page redirect, or an active-but-unverified session all get
  // bounced to /waiting instead — even if a seat is technically already
  // active — so the waiting screen is always seen first.
  const cameFromWaiting = searchParams?.seated === '1';
  if (!cameFromWaiting || session?.status !== 'active') {
    redirect('/waiting');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  return <ChatApp userEmail={user.email} isAdmin={!!profile?.is_admin} />;
}
