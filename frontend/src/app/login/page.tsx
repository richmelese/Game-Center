'use client';

import { Smartphone } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { AppShell, ErrorNote } from '@/components/AppShell';
import { JourneyProgress } from '@/components/JourneySteps';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isInSuperApp, requestTelebirrAuthToken } from '@/lib/telebirr-bridge';
import type { User } from '@/lib/types';

type Session = { accessToken: string; user: User };

function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

function LoginForm() {
  const { signIn, user, ready } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [stage, setStage] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (ready && user) router.replace(next);
  }, [ready, user, next, router]);

  // Inside the telebirr SuperApp: sign in silently with the host app's token.
  useEffect(() => {
    if (!isInSuperApp()) return;
    setBusy(true);
    requestTelebirrAuthToken()
      .then(async (authToken) => {
        if (!authToken) return;
        const s = await api<Session>('/auth/telebirr', { body: { authToken } });
        signIn(s.accessToken, s.user);
        router.replace(next);
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, [signIn, router, next]);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api<{ devCode?: string }>('/auth/otp/request', { body: { phone } });
      setDevCode(r.devCode ?? null);
      setStage('code');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const s = await api<Session>('/auth/otp/verify', { body: { phone, code } });
      signIn(s.accessToken, s.user);
      router.replace(next);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <AppShell title="Log in">
      <JourneyProgress step={1} />
      <div className="card mt-4 p-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <Smartphone className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="mt-3 text-xl font-bold text-slate-900">Log in with your telebirr number</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your subscriptions are paid with telebirr and your coins are converted to this number.
        </p>

        {stage === 'phone' ? (
          <form onSubmit={sendCode} className="mt-5 space-y-3">
            <label className="block text-sm font-medium text-slate-700" htmlFor="phone">
              Phone number
            </label>
            <input
              id="phone"
              className="input"
              inputMode="tel"
              autoComplete="tel"
              placeholder="09XX XXX XXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <button className="btn-primary w-full" disabled={busy || phone.trim().length < 9}>
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-5 space-y-3">
            <label className="block text-sm font-medium text-slate-700" htmlFor="code">
              6-digit code sent to {phone}
            </label>
            <input
              id="code"
              className="input text-center text-2xl tracking-[0.5em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
            />
            {devCode && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
                Development mode — your code is <strong>{devCode}</strong>
              </p>
            )}
            <button className="btn-primary w-full" disabled={busy || code.length !== 6}>
              {busy ? 'Checking…' : 'Log in'}
            </button>
            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => {
                setStage('phone');
                setCode('');
              }}
            >
              Use a different number
            </button>
          </form>
        )}
        {error && <div className="mt-3"><ErrorNote message={error} /></div>}
      </div>
    </AppShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
