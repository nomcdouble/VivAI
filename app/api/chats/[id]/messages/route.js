import { createClient } from '../../../../../lib/supabase/server';

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

export async function GET(request, { params }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Not logged in' }, { status: 401 });

  const { data, error } = await supabase
    .from('messages')
    .select('role, content, created_at')
    .eq('chat_id', params.id)
    .order('created_at', { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ messages: data });
}
