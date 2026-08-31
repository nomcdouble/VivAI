'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabase/client';

const POLL_INTERVAL_MS = 4000;

export default function WaitingRoom({ initialStatus, initialPosition }) {
  const router = useRouter();
  const supabase = createClient();

  const [position, setPosition] = useState(initialPosition ?? null);
  const [errorMsg, setErrorMsg] = useState('');
  const redirectingRef = useRef(false);
  const alreadySeated = initialStatus === 'active';

  useEffect(() => {
    let cancelled = false;
    let timer;

    function goToChat() {
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      router.replace('/chat?seated=1');
      router.refresh();
    }

    // A seat was already free when we hit /waiting — show the screen
    // briefly, then send them on to /chat.
    if (alreadySeated) {
      timer = setTimeout(goToChat, 700);
      return () => clearTimeout(timer);
    }

    async function poll() {
      try {
        const { data, error } = await supabase.rpc('check_waiting_status').single();

        if (cancelled) return;

        if (error) {
          setErrorMsg("Couldn't check your spot in line. Retrying...");
        } else {
          setErrorMsg('');
          if (data?.status === 'active') {
            goToChat();
            return;
          }
          setPosition(data?.position ?? null);
        }
      } catch {
        if (!cancelled) setErrorMsg("Couldn't check your spot in line. Retrying...");
      } finally {
        if (!cancelled && !redirectingRef.current) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    }

    timer = setTimeout(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="waiting-wrap">
      <div className="waiting-card">
        <div className="brand">
          <span className="brand-text">VivAI</span>
        </div>

        {alreadySeated ? (
          <div className="waiting-loading">
            <span className="waiting-spinner" aria-hidden="true" />
            <p>You&rsquo;re up! Taking you to chat...</p>
          </div>
        ) : (
          <>
            <p className="waiting-message">
              Hey! There are currently too many people using Viv right now, your position:{' '}
              <strong>{position ?? '...'}</strong>
            </p>
            <div className="waiting-loading">
              <span className="waiting-spinner" aria-hidden="true" />
              <p className="waiting-subtext">
                Hang tight &mdash; you&rsquo;ll be dropped into chat automatically the moment a spot opens up.
              </p>
            </div>
            {errorMsg && <p className="error">{errorMsg}</p>}
          </>
        )}
      </div>
    </div>
  );
}
