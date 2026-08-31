'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createClient } from '../lib/supabase/client';

// Splits assistant message content around <think>...</think> blocks.
// Returns an array of parts, each either a plain string or { think: true }.
// An unterminated trailing <think> (still streaming) is treated as a think
// block too, so the reasoning text never flashes on screen before the
// closing tag arrives.
function splitThinkingParts(content) {
  const parts = [];
  const lower = content.toLowerCase();
  let i = 0;

  while (i < content.length) {
    const start = lower.indexOf('<think>', i);
    if (start === -1) {
      parts.push(content.slice(i));
      break;
    }
    if (start > i) parts.push(content.slice(i, start));

    const end = lower.indexOf('</think>', start);
    if (end === -1) {
      parts.push({ think: true });
      break;
    }
    parts.push({ think: true });
    i = end + '</think>'.length;
  }

  return parts;
}

const MAX_TURNS_PER_CHAT = 10;

export default function ChatApp({ userEmail, isAdmin }) {
  const router = useRouter();
  const supabase = createClient();

  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState('');
  const [showGlobalPromptModal, setShowGlobalPromptModal] = useState(false);
  const [globalPromptText, setGlobalPromptText] = useState('');
  const [globalPromptLoading, setGlobalPromptLoading] = useState(false);
  const [globalPromptSaving, setGlobalPromptSaving] = useState(false);
  const [globalPromptSaved, setGlobalPromptSaved] = useState(false);
  const [globalPromptError, setGlobalPromptError] = useState('');
  const [chatLimitReached, setChatLimitReached] = useState(false);
  const textareaRef = useRef(null);
  const messagesRef = useRef(null);

  useEffect(() => {
    loadChats();
    loadModels();
  }, []);

  // Keep this tab's active seat alive so it doesn't get pruned and handed
  // to someone waiting in line.
  useEffect(() => {
    supabase.rpc('heartbeat_app_session').then(
      () => {},
      () => {}
    );
    const interval = setInterval(() => {
      supabase.rpc('heartbeat_app_session').then(
        () => {},
        () => {}
      );
    }, 20000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadModels() {
    try {
      const res = await fetch('/api/models');
      if (res.ok) {
        const data = await res.json();
        const list = data.models || [];
        setModels(list);
        if (list.length > 0) setModel((prev) => prev || list[0].id);
      }
    } catch {
    }
  }

  async function loadChats() {
    const res = await fetch('/api/chats');
    if (res.ok) {
      const data = await res.json();
      setChats(data.chats || []);
    }
  }

  async function openChat(chatId) {
    setActiveChatId(chatId);
    setSidebarOpen(false);
    setChatLimitReached(false);
    const res = await fetch(`/api/chats/${chatId}/messages`);
    if (res.ok) {
      const data = await res.json();
      const loaded = data.messages || [];
      setMessages(loaded);
      const userTurns = loaded.filter((m) => m.role === 'user').length;
      setChatLimitReached(userTurns >= MAX_TURNS_PER_CHAT);
    }
  }

  async function deleteChat(e, chatId) {
    e.stopPropagation();
    if (!window.confirm('Delete this chat? This cannot be undone.')) return;

    const res = await fetch(`/api/chats/${chatId}`, { method: 'DELETE' });
    if (res.ok) {
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      if (chatId === activeChatId) {
        setActiveChatId(null);
        setMessages([]);
      }
    }
  }

  function startNewChat() {
    setActiveChatId(null);
    setMessages([]);
    setSidebarOpen(false);
    setChatLimitReached(false);
  }

  async function handleLogout() {
    await supabase.rpc('leave_app_session').then(
      () => {},
      () => {}
    );
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  function autosize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const content = input.trim();
    if (!content || sending || chatLimitReached) return;

    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setMessages((prev) => [...prev, { role: 'user', content }]);
    setSending(true);

    let assistantText = '';
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: activeChatId, content, model }),
      });

      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.limitReached) setChatLimitReached(true);
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', content: `[Error: ${data.error || res.status}]` };
          return next;
        });
        // The user message may already be saved server-side under a newly
        // created chat even though the request errored out (e.g. the model
        // server was unreachable). Adopt that chat id so a retry appends to
        // the same chat instead of spawning a fresh one each time, and
        // refresh the sidebar so it shows up right away instead of only
        // after a page reload.
        if (data.chatId && data.chatId !== activeChatId) {
          setActiveChatId(data.chatId);
          loadChats();
        }
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let newChatId = activeChatId;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;

          try {
            const json = JSON.parse(payload);
            if (json._chat_id) {
              newChatId = json._chat_id;
              continue;
            }
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              assistantText += delta;
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: 'assistant', content: assistantText };
                return next;
              });
            }
          } catch {
          }
        }
      }

      if (newChatId && newChatId !== activeChatId) {
        setActiveChatId(newChatId);
        loadChats();
      }
    } catch (err) {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: '[Connection error]' };
        return next;
      });
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages]);

  async function openGlobalPromptModal() {
    setShowGlobalPromptModal(true);
    setGlobalPromptSaved(false);
    setGlobalPromptError('');
    setGlobalPromptLoading(true);
    try {
      const res = await fetch('/api/admin/global-prompt');
      if (res.ok) {
        const data = await res.json();
        setGlobalPromptText(data.prompt || '');
      } else {
        setGlobalPromptError('Could not load the current global prompt.');
      }
    } catch {
      setGlobalPromptError('Could not load the current global prompt.');
    } finally {
      setGlobalPromptLoading(false);
    }
  }

  async function saveGlobalPrompt() {
    setGlobalPromptSaving(true);
    setGlobalPromptSaved(false);
    setGlobalPromptError('');
    try {
      const res = await fetch('/api/admin/global-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: globalPromptText }),
      });
      if (res.ok) {
        setGlobalPromptSaved(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setGlobalPromptError(data.error || 'Could not save the global prompt.');
      }
    } catch {
      setGlobalPromptError('Could not save the global prompt.');
    } finally {
      setGlobalPromptSaving(false);
    }
  }

  const initial = (userEmail || '?').charAt(0).toUpperCase();

  return (
    <div className="app">
      <div
        className={`sidebar-backdrop ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="brand">
            <span className="brand-text">VivAI</span>
          </div>
          <button className="new-chat-btn" onClick={startNewChat}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New chat
          </button>
        </div>
        <div className="chat-list">
          {chats.length === 0 && <div className="chat-list-empty">Your conversations will show up here.</div>}
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={`chat-list-item ${chat.id === activeChatId ? 'active' : ''}`}
              onClick={() => openChat(chat.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') openChat(chat.id);
              }}
              role="button"
              tabIndex={0}
              title={chat.title}
            >
              <span className="chat-list-item-title">{chat.title}</span>
              <button
                type="button"
                className="chat-delete-btn"
                aria-label="Delete chat"
                title="Delete chat"
                onClick={(e) => deleteChat(e, chat.id)}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <div className="sidebar-footer">
          <span title={userEmail}>{userEmail}</span>
          <div className="sidebar-footer-actions">
            {isAdmin && (
              <button
                className="icon-btn"
                onClick={openGlobalPromptModal}
                aria-label="Global prompt settings"
                title="Global prompt settings"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            )}
            <button className="ghost-btn" onClick={handleLogout}>Log out</button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <span className="brand">
            <span className="brand-text">VivAI</span>
          </span>
          <div className="model-select-wrap">
            <select
              className="model-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              aria-label="Choose model"
              disabled={models.length === 0}
            >
              {models.length === 0 && <option value="">Loading models...</option>}
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
        </header>

        <main className="messages" ref={messagesRef}>
          {messages.length === 0 && (
            <div className="empty-state">
              <span className="brand-mark" />
              <h2>Start a conversation</h2>
              <p>Ask anything &mdash; your message goes straight to the model, and the reply streams back in real time.</p>
            </div>
          )}
          {messages.map((m, i) => {
            const isLast = i === messages.length - 1;
            const isStreamingEmpty = isLast && m.role === 'assistant' && sending && !m.content;
            return (
              <div key={i} className={`msg-row ${m.role}`}>
                <span className={`avatar ${m.role}`}>{m.role === 'assistant' ? '' : initial}</span>
                <div className="msg">
                  {isStreamingEmpty ? (
                    <span className="typing-dots" />
                  ) : m.role === 'assistant' ? (
                    splitThinkingParts(m.content).map((part, idx) =>
                      typeof part === 'string' ? (
                        <div key={idx} className="msg-markdown">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{part}</ReactMarkdown>
                        </div>
                      ) : (
                        <span key={idx} className="thinking-label">Thinking</span>
                      )
                    )
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            );
          })}
        </main>

        <div className="composer-wrap">
          <form className="composer" onSubmit={handleSubmit}>
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder={chatLimitReached ? 'This chat is full — start a new chat to keep going' : 'Message the model...'}
              value={input}
              disabled={chatLimitReached}
              onChange={(e) => { setInput(e.target.value); autosize(); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
            <button className="send-btn" type="submit" disabled={sending || chatLimitReached || !input.trim()} aria-label="Send message">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>
          <p className="composer-hint">
            {chatLimitReached
              ? 'This chat reached its 10-message limit. Start a new chat to continue.'
              : <>Enter to send &middot; Shift+Enter for a new line</>}
          </p>
        </div>
      </div>

      {showGlobalPromptModal && (
        <div className="modal-backdrop" onClick={() => setShowGlobalPromptModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Global prompt</h3>
            <p className="modal-desc">
              This system prompt is sent with every user&rsquo;s messages to the model, across all accounts.
            </p>
            <textarea
              value={globalPromptText}
              onChange={(e) => setGlobalPromptText(e.target.value)}
              placeholder={globalPromptLoading ? 'Loading...' : 'Enter a prompt to apply for everyone...'}
              disabled={globalPromptLoading || globalPromptSaving}
            />
            {globalPromptError && <p className="error">{globalPromptError}</p>}
            <div className="modal-actions">
              {globalPromptSaved && <span className="modal-status">Saved</span>}
              <button className="ghost-btn" onClick={() => setShowGlobalPromptModal(false)}>
                Close
              </button>
              <button
                className="primary-btn"
                onClick={saveGlobalPrompt}
                disabled={globalPromptLoading || globalPromptSaving}
                style={{ marginTop: 0 }}
              >
                {globalPromptSaving ? 'Saving...' : 'Save for all users'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
