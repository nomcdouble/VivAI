import { createClient } from '../../../lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function methodNotAllowed() {
  return Response.json(
    { error: 'This endpoint only accepts GET requests.' },
    { status: 405, headers: { Allow: 'GET' } }
  );
}
export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Not logged in' }, { status: 401 });

  const { data, error } = await supabase
    .from('chats')
    .select('id, title, updated_at')
    .order('updated_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ chats: data });
}
