'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/client';

function friendlyAuthError(authError) {
  const msg = authError?.message || '';
  if (/rate limit/i.test(msg)) {
    return "You've tried this a few too many times in a row. Wait a minute or two and try again.";
  }
  if (/already registered|already exists/i.test(msg)) {
    return 'An account with that email already exists. Try logging in instead.';
  }
  if (/invalid login credentials/i.test(msg)) {
    return 'That email or password is incorrect.';
  }
  return msg;
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [tab, setTab] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreedToTos, setAgreedToTos] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    if (searchParams.get('tab') === 'register') {
      setTab('register');
    }
  }, [searchParams]);

  async function handleGoogleSignIn() {
    setError('');
    setGoogleBusy(true);
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/waiting`,
      },
    });
    if (authError) {
      setError(friendlyAuthError(authError));
      setGoogleBusy(false);
    }
    // On success the browser is redirected to Google, so no further
    // state update is needed here.
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // Clickwrap: signup is a hard stop without explicit agreement, checked
    // again here (not just via the checkbox's `required`) so it can't be
    // bypassed by submitting the form programmatically.
    if (tab === 'register' && !agreedToTos) {
      setError('You need to agree to the Terms of Service to create an account.');
      return;
    }

    setBusy(true);

    const action =
      tab === 'login'
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });

    const { error: authError } = await action;
    setBusy(false);

    if (authError) {
      setError(friendlyAuthError(authError));
      return;
    }

    if (tab === 'register') {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setError('Check your email to confirm your account, then log in.');
        setTab('login');
        return;
      }
    }

    // Both login and signup always land on /waiting first — it's the only
    // place a seat is claimed, and /chat won't render without going through it.
    router.push('/waiting');
    router.refresh();
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand">
          <span className="brand-text">VivAI</span>
        </div>
        <div className="tabs">
          <button
            type="button"
            className={`tab-btn ${tab === 'login' ? 'active' : ''}`}
            onClick={() => { setTab('login'); setError(''); }}
          >
            Log in
          </button>
          <button
            type="button"
            className={`tab-btn ${tab === 'register' ? 'active' : ''}`}
            onClick={() => { setTab('register'); setError(''); }}
          >
            Sign up
          </button>
        </div>

        <button
          type="button"
          className="google-btn"
          onClick={handleGoogleSignIn}
          disabled={googleBusy || busy}
        >
          <svg className="google-icon" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03l2.97-2.33z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
          </svg>
          {tab === 'login' ? 'Continue with Google' : 'Sign up with Google'}
        </button>

        <div className="auth-divider"><span>or</span></div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              minLength={8}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {tab === 'register' && <p className="hint">At least 8 characters.</p>}
          {tab === 'register' && (
            <label className="tos-check">
              <input
                type="checkbox"
                required
                checked={agreedToTos}
                onChange={(e) => setAgreedToTos(e.target.checked)}
              />
              <span>
                I agree to the{' '}
                <Link href="/tos" target="_blank" rel="noopener noreferrer">
                  Terms of Service
                </Link>
              </span>
            </label>
          )}
          <button className="primary-btn" type="submit" disabled={busy || (tab === 'register' && !agreedToTos)}>
            {tab === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>

        <p className="error">{error}</p>
      </div>
    </div>
  );
}
