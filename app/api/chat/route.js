import { createClient } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function methodNotAllowed() {
  return Response.json(
    { error: 'This endpoint only accepts POST requests.' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}
export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;

export async function POST(request) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: 'Not logged in' }, { status: 401 });
  }

  // Keep this user's active seat alive while they're actually chatting.
  supabase.rpc('heartbeat_app_session').then(
    () => {},
    () => {}
  );

  const body = await request.json().catch(() => null);
  const content = body?.content?.trim();
  const requestedModel = typeof body?.model === 'string' ? body.model.trim() : '';
  let chatId = body?.chatId || null;

  if (!content) {
    return Response.json({ error: '"content" is required' }, { status: 400 });
  }

  if (!chatId) {
    const title = content.length > 60 ? content.slice(0, 57) + '...' : content;
    const { data: newChat, error: chatError } = await supabase
      .from('chats')
      .insert({ user_id: user.id, title })
      .select('id')
      .single();

    if (chatError) {
      console.error('Could not create chat:', chatError.message);
      return Response.json({ error: 'Could not create chat' }, { status: 500 });
    }
    chatId = newChat.id;
  } else {
    const { data: chat, error: chatLookupError } = await supabase
      .from('chats')
      .select('id')
      .eq('id', chatId)
      .maybeSingle();
    if (chatLookupError || !chat) {
      return Response.json({ error: 'Chat not found' }, { status: 404 });
    }
  }

  const { data: priorMessages, error: historyError } = await supabase
    .from('messages')
    .select('role, content')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  if (historyError) {
    console.error('Could not load history:', historyError.message);
    return Response.json({ error: 'Could not load chat history', chatId }, { status: 500 });
  }

  const MAX_TURNS_PER_CHAT = 10;
  const userTurnCount = priorMessages.filter((m) => m.role === 'user').length;
  if (userTurnCount >= MAX_TURNS_PER_CHAT) {
    return Response.json(
      {
        error: `This chat has reached the ${MAX_TURNS_PER_CHAT}-message limit. Please start a new chat to keep going.`,
        limitReached: true,
        chatId,
      },
      { status: 429 }
    );
  }

  const { error: insertUserMsgError } = await supabase
    .from('messages')
    .insert({ chat_id: chatId, user_id: user.id, role: 'user', content });
  if (insertUserMsgError) {
    console.error('Could not save user message:', insertUserMsgError.message);
    return Response.json({ error: 'Could not save message', chatId }, { status: 500 });
  }

  const { data: settings } = await supabase
    .from('user_settings')
    .select('default_model')
    .eq('user_id', user.id)
    .maybeSingle();
  const model = requestedModel;

  const { data: appSettings } = await supabase
    .from('app_settings')
    .select('global_prompt')
    .eq('id', 1)
    .maybeSingle();
  const globalPrompt = appSettings?.global_prompt?.trim();

  const upstreamMessages = [
    ...(globalPrompt ? [{ role: 'system', content: globalPrompt }] : []),
    ...priorMessages,
    { role: 'user', content },
  ];

  const upstreamHeaders = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  };
  if (process.env.VLLM_API_KEY) {
    upstreamHeaders.Authorization = `Bearer ${process.env.VLLM_API_KEY}`;
  }

  const vllmBaseUrl = process.env.VLLM_BASE_URL || 'https://junkie-demote-elixir.ngrok-free.dev/v1';

  let upstream;
  try {
    upstream = await fetch(`${vllmBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify({ model, messages: upstreamMessages, stream: true, temperature: 0.7 }),
    });
  } catch (err) {
    console.error('Could not reach vLLM server:', err.message);
    return Response.json({ error: 'Could not reach the model server', chatId }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '');
    console.error('vLLM error:', upstream.status, text);
    const status = upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502;
    return Response.json(
      { error: `Model server returned an error (${upstream.status})`, chatId },
      { status }
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let assistantText = '';

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ _chat_id: chatId })}\n\n`));

      const reader = upstream.body.getReader();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunkText = decoder.decode(value, { stream: true });
          buffer += chunkText;
          controller.enqueue(encoder.encode(chunkText));

          for (const line of chunkText.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
              const json = JSON.parse(payload);
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) assistantText += delta;
            } catch {
            }
          }
        }
      } catch (err) {
        console.error('Stream error:', err.message);
      } finally {
        controller.close();

        // Even if the upstream connection dropped mid-stream and produced no
        // content, save *something* so the chat doesn't sit there with a
        // dangling user message and a blank reply that looks broken on
        // reload.
        const finalText = assistantText || '[The model server closed the connection before replying. Please try again.]';
        await supabase
          .from('messages')
          .insert({ chat_id: chatId, user_id: user.id, role: 'assistant', content: finalText });
        await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
