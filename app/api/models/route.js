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

  const vllmBaseUrl = process.env.VLLM_BASE_URL || 'https://junkie-demote-elixir.ngrok-free.dev/v1';

  const headers = {
    'ngrok-skip-browser-warning': 'true',
  };
  if (process.env.VLLM_API_KEY) {
    headers.Authorization = `Bearer ${process.env.VLLM_API_KEY}`;
  }

  let upstream;
  try {
    upstream = await fetch(`${vllmBaseUrl}/models`, { headers });
  } catch (err) {
    console.error('Could not reach vLLM server for models:', err.message);
    return Response.json({ error: 'Could not reach the model server' }, { status: 502 });
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '');
    console.error('vLLM models error:', upstream.status, text);
    const status = upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502;
    return Response.json(
      { error: `Model server returned an error (${upstream.status})` },
      { status }
    );
  }

  const data = await upstream.json().catch(() => null);
  // OpenAI-compatible servers (including vLLM) return { object: 'list', data: [{ id, ... }, ...] }
  const models = Array.isArray(data?.data)
    ? data.data.map((m) => ({ id: m.id, label: m.id }))
    : [];

  return Response.json({ models });
}
