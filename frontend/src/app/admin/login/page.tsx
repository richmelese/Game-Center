'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorNote } from '@/components/AppShell';
import { api, tokens } from '@/lib/api';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api<{ accessToken: string }>('/auth/admin/login', { body: { email, password } });
      tokens.setAdmin(r.accessToken);
      router.replace('/admin');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <Image src="/lemat-mark.png" alt="LEMAT" width={140} height={93} className="h-12 w-auto" priority />
        <div>
          <h1 className="text-xl font-bold text-slate-900">Game Center admin</h1>
          <p className="text-sm text-slate-500">LEMAT TECHNOLOGY PLC operations</p>
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">Email</label>
          <input id="email" type="email" className="input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">Password</label>
          <input id="password" type="password" className="input mt-1" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </div>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        {error && <ErrorNote message={error} />}
      </form>
    </div>
  );
}
