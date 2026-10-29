import { LifeBuoy } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AppShell, ErrorNote } from '@/components/AppShell';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useRequireAuth } from '@/lib/use-require-auth';

interface Ticket {
  id: string;
  subject: string;
  message: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  response: string | null;
  createdAt: string;
}

/** First-level customer support and feedback (proposal section 4.4). */
export default function SupportPage() {
  const { user } = useRequireAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const load = useCallback(() => api<Ticket[]>('/support/tickets').then(setTickets), []);
  useEffect(() => {
    if (user) load().catch((e) => setError(e.message));
  }, [user, load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSent(false);
    try {
      await api('/support/tickets', { body: { subject, message } });
      setSubject('');
      setMessage('');
      setSent(true);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Help & feedback">
      <form onSubmit={submit} className="card space-y-3 p-4">
        <h1 className="flex items-center gap-2 text-base font-bold text-slate-900">
          <LifeBuoy className="h-5 w-5 text-brand-600" aria-hidden /> Contact LEMAT support
        </h1>
        <p className="text-sm text-slate-500">Payment issue, game problem or an idea? We reply here.</p>
        <label htmlFor="subject" className="block text-sm font-medium text-slate-700">
          Subject
        </label>
        <input
          id="subject"
          className="input"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          minLength={3}
          maxLength={120}
          required
        />
        <label htmlFor="message" className="block text-sm font-medium text-slate-700">
          Message
        </label>
        <textarea
          id="message"
          className="input min-h-28"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          minLength={5}
          maxLength={2000}
          required
        />
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? 'Sending…' : 'Send'}
        </button>
        {sent && <p role="status" className="text-sm text-leaf-600">Thanks — your message was received.</p>}
        {error && <ErrorNote message={error} />}
      </form>

      <h2 className="mt-6 text-base font-bold text-slate-900">Your requests</h2>
      <ul className="mt-3 space-y-3">
        {tickets.length === 0 && <li className="text-sm text-slate-500">No requests yet.</li>}
        {tickets.map((t) => (
          <li key={t.id} className="card p-4 text-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-slate-900">{t.subject}</p>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {t.status.replace('_', ' ').toLowerCase()}
              </span>
            </div>
            <p className="mt-1 text-slate-600">{t.message}</p>
            {t.response && (
              <p className="mt-3 rounded-xl bg-brand-50 p-3 text-brand-900">
                <strong>LEMAT support:</strong> {t.response}
              </p>
            )}
            <p className="mt-2 text-xs text-slate-400">{dateTime(t.createdAt)}</p>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
