import { createClient } from '../../../../lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function methodNotAllowed() {
  return Response.json(
    { error: 'This endpoint only accepts DELETE requests.' },
    { status: 405, headers: { Allow: 'DELETE' } }
  );
}
export const GET = methodNotAllowed;
export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;

export async function DELETE(request, { params }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Not logged in' }, { status: 401 });

  const { error, count } = await supabase
    .from('chats')
    .delete({ count: 'exact' })
    .eq('id', params.id);

  if (error) {
    console.error('Could not delete chat:', error.message);
    return Response.json({ error: 'Could not delete chat' }, { status: 500 });
  }
  if (!count) {
    return Response.json({ error: 'Chat not found' }, { status: 404 });
  }

  return Response.json({ ok: true });
}
