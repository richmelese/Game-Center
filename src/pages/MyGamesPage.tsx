import { Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell, ErrorNote, Spinner } from '@/components/AppShell';
import { GameArt } from '@/components/GameArt';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime, etb, PLAN_LABEL } from '@/lib/format';
import type { Order, PlanType } from '@/lib/types';
import { useRequireAuth } from '@/lib/use-require-auth';

interface Subscription {
  id: string;
  type: PlanType;
  game: { slug: string; title: string; category: string; themeColor: string; imageUrl: string | null };
  startsAt: string;
  expiresAt: string | null;
  playsRemaining: number | null;
  isActiveNow: boolean;
}

const ORDER_STYLE: Record<Order['status'], string> = {
  PAID: 'text-leaf-600',
  PENDING: 'text-amber-600',
  FAILED: 'text-red-600',
  CANCELLED: 'text-slate-400',
};

export default function MyGamesPage() {
  const { user } = useRequireAuth();
  const { signOut } = useAuth();
  const [subs, setSubs] = useState<Subscription[] | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    Promise.all([api<Subscription[]>('/me/subscriptions'), api<Order[]>('/payments/orders')])
      .then(([s, o]) => {
        setSubs(s);
        setOrders(o);
      })
      .catch((e) => setError(e.message));
  }, [user]);

  return (
    <AppShell title="My games">
      {error && <ErrorNote message={error} />}
      {!subs && !error && <Spinner />}
      {subs && (
        <>
          <h1 className="text-base font-bold text-slate-900">Active access</h1>
          {subs.length === 0 && (
            <div className="card mt-3 p-5 text-center text-sm text-slate-500">
              You have no active games yet.
              <Link to="/" className="btn-primary mt-3 w-full">
                Browse games
              </Link>
            </div>
          )}
          <ul className="mt-3 space-y-3">
            {subs.map((s) => (
              <li key={s.id} className="card flex items-center gap-3 overflow-hidden pr-3">
                <GameArt slug={s.game.slug} image={s.game.imageUrl} color={s.game.themeColor} title={s.game.title} className="h-20 w-20 shrink-0" iconClassName="h-8 w-8" />
                <div className="min-w-0 flex-1 py-3">
                  <p className="truncate text-sm font-bold text-slate-900">{s.game.title}</p>
                  <p className="text-xs text-slate-500">
                    {PLAN_LABEL[s.type]} ·{' '}
                    {s.expiresAt
                      ? `${s.isActiveNow ? 'until' : 'starts after current plan, until'} ${dateTime(s.expiresAt)}`
                      : `${s.playsRemaining} play${s.playsRemaining === 1 ? '' : 's'} left`}
                  </p>
                </div>
                <Link
                  to={`/play/${s.game.slug}?mode=FULL`}
                  className="btn-leaf px-3 py-2"
                  aria-label={`Play ${s.game.title}`}
                >
                  <Play className="h-4 w-4" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>

          <h2 className="mt-8 text-base font-bold text-slate-900">Payment history</h2>
          <ul className="card mt-3 divide-y divide-slate-100">
            {orders.length === 0 && <li className="p-4 text-sm text-slate-500">No payments yet.</li>}
            {orders.map((o) => (
              <li key={o.merchOrderId} className="flex items-center justify-between p-4 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-slate-900">
                    {o.game.title} · {PLAN_LABEL[o.planType]}
                  </span>
                  <span className="text-xs text-slate-500">{o.createdAt && dateTime(o.createdAt)}</span>
                </span>
                <span className="text-right">
                  <span className="block font-semibold text-slate-900">{etb(o.amountCents)}</span>
                  <span className={`text-xs font-semibold ${ORDER_STYLE[o.status]}`}>{o.status.toLowerCase()}</span>
                </span>
              </li>
            ))}
          </ul>

          <button onClick={signOut} className="btn-ghost mt-8 w-full">
            Log out {user?.phone ? `(${user.phone.replace(/^251/, '0')})` : ''}
          </button>
        </>
      )}
    </AppShell>
  );
}
