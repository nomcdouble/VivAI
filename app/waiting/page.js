import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import WaitingRoom from '../../components/WaitingRoom';

export default async function WaitingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Only ever reachable once someone is actually logged in — middleware
  // already sends anonymous visitors to /login before they can get here.
  if (!user) redirect('/login');

  // This is the only place a seat actually gets claimed. /chat itself never
  // grants a seat — it just checks whether one is already held.
  const { data: seat } = await supabase.rpc('enter_app_session').single();

  return <WaitingRoom initialStatus={seat?.status ?? 'waiting'} initialPosition={seat?.position ?? null} />;
}
