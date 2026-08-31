import { createClient } from '../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function methodNotAllowed() {
  return Response.json(
    { error: 'This endpoint only accepts GET and POST requests.' },
    { status: 405, headers: { Allow: 'GET, POST' } }
  );
}
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;

async function requireAdmin(supabase) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { errorResponse: Response.json({ error: 'Not logged in' }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile?.is_admin) {
    return { errorResponse: Response.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user };
}

export async function GET() {
  const supabase = createClient();
  const { errorResponse } = await requireAdmin(supabase);
  if (errorResponse) return errorResponse;

  const { data, error } = await supabase
    .from('app_settings')
    .select('global_prompt')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    console.error('Could not load global prompt:', error.message);
    return Response.json({ error: 'Could not load global prompt' }, { status: 500 });
  }

  return Response.json({ prompt: data?.global_prompt || '' });
}

export async function POST(request) {
  const supabase = createClient();
  const { errorResponse } = await requireAdmin(supabase);
  if (errorResponse) return errorResponse;

  const body = await request.json().catch(() => null);
  const prompt = typeof body?.prompt === 'string' ? body.prompt : '';

  const { error } = await supabase
    .from('app_settings')
    .upsert({ id: 1, global_prompt: prompt, updated_at: new Date().toISOString() });

  if (error) {
    console.error('Could not save global prompt:', error.message);
    return Response.json({ error: 'Could not save global prompt' }, { status: 500 });
  }

  return Response.json({ ok: true });
}
