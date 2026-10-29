import { CircleCheck, CircleX, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AppShell, ErrorNote, Spinner } from '@/components/AppShell';
import { JourneyProgress } from '@/components/JourneySteps';
import { api } from '@/lib/api';
import { dateTime, etb, PLAN_LABEL } from '@/lib/format';
import type { Order } from '@/lib/types';
import { useRequireAuth } from '@/lib/use-require-auth';

const POLL_MS = 2000;
const MAX_POLLS = 45; // telebirr notifies asynchronously; wait up to ~90 s

/** Journey step 5: successful transaction results in game access / entitlement. */
export default function PaymentResultPage() {
  const { user } = useRequireAuth();
  const [searchParams] = useSearchParams();
  const merchOrderId = searchParams.get('order') ?? '';
  const [order, setOrder] = useState<Order | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !merchOrderId) return;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const load = async () => {
      try {
        const o = await api<Order>(`/payments/orders/${merchOrderId}`);
        if (stopped) return;
        setOrder(o);
        if (o.status === 'PENDING') {
          if (++polls >= MAX_POLLS) setGaveUp(true);
          else timer = setTimeout(load, POLL_MS);
        }
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
    };
    load();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [user, merchOrderId]);

  const paid = order?.status === 'PAID';
  const ent = order?.entitlement;

  return (
    <AppShell title="Payment">
      <JourneyProgress step={paid ? 5 : 4} />
      <div className="card mt-4 p-6 text-center">
        {error && <ErrorNote message={error} />}
        {!order && !error && <Spinner label="Checking your payment…" />}

        {order?.status === 'PENDING' && !gaveUp && <Spinner label="Waiting for telebirr to confirm your payment…" />}
        {order?.status === 'PENDING' && gaveUp && (
          <p className="text-sm text-slate-600">
            telebirr has not confirmed this payment yet. If money left your account, access is added automatically once
            confirmation arrives — check <Link className="font-semibold text-brand-600" to="/my-games">My games</Link>.
          </p>
        )}

        {paid && (
          <>
            <CircleCheck className="mx-auto h-16 w-16 text-leaf-500" aria-hidden />
            <h1 className="mt-3 text-xl font-bold text-slate-900">Payment successful</h1>
            <p className="mt-1 text-sm text-slate-500">
              {etb(order.amountCents)} · {order.game.title} · {PLAN_LABEL[order.planType]}
            </p>
            {ent && (
              <div className="mt-4 rounded-xl bg-leaf-500/10 p-3 text-sm text-leaf-600">
                {ent.expiresAt
                  ? `Unlimited play until ${dateTime(ent.expiresAt)}`
                  : `${ent.playsRemaining ?? 1} game session${ent.playsRemaining === 1 ? '' : 's'} added`}
              </div>
            )}
            <Link to={`/play/${order.game.slug}?mode=FULL`} className="btn-leaf mt-5 w-full text-base">
              <Play className="h-5 w-5" aria-hidden /> Launch {order.game.title}
            </Link>
          </>
        )}

        {(order?.status === 'FAILED' || order?.status === 'CANCELLED') && (
          <>
            <CircleX className="mx-auto h-16 w-16 text-red-500" aria-hidden />
            <h1 className="mt-3 text-xl font-bold text-slate-900">
              Payment {order.status === 'CANCELLED' ? 'cancelled' : 'failed'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">No money was taken and no access was added.</p>
            <Link to={`/games/${order.game.slug}`} className="btn-primary mt-5 w-full">
              Try again
            </Link>
          </>
        )}
      </div>
    </AppShell>
  );
}
