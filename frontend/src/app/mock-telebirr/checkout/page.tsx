'use client';

import { FlaskConical, Lock } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ErrorNote, Spinner } from '@/components/AppShell';
import { JourneyProgress } from '@/components/JourneySteps';
import { api } from '@/lib/api';
import { displayPhone, etb } from '@/lib/format';
import type { Order } from '@/lib/types';
import { useRequireAuth } from '@/lib/use-require-auth';

/**
 * DEVELOPMENT ONLY — stands in for telebirr's hosted checkout (journey step 4) when the
 * backend runs with PAYMENT_PROVIDER=mock. With PAYMENT_PROVIDER=telebirr customers are
 * sent to the real telebirr checkout instead and this page is never used.
 */
function MockCheckout() {
  const { user } = useRequireAuth();
  const router = useRouter();
  const merchOrderId = useSearchParams().get('order') ?? '';
  const [order, setOrder] = useState<(Order & { title: string }) | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !merchOrderId) return;
    api<Order & { title: string }>(`/payments/orders/${merchOrderId}/checkout-info`)
      .then(setOrder)
      .catch((e) => setError(e.message));
  }, [user, merchOrderId]);

  async function finish(success: boolean) {
    setBusy(true);
    setError('');
    try {
      await api('/payments/mock/complete', { body: { merchOrderId, success } });
      router.replace(`/payment/result?order=${merchOrderId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-slate-100 px-4 py-6">
      <p className="mb-4 flex items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-xs font-medium text-amber-900">
        <FlaskConical className="h-4 w-4 shrink-0" aria-hidden />
        Simulated telebirr payment — development mode. No money is moved.
      </p>
      <JourneyProgress step={4} />

      <div className="card mt-4 p-5">
        {!order && !error && <Spinner label="Loading payment…" />}
        {order && (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pay to</p>
            <p className="text-sm font-bold text-slate-900">LEMAT TECHNOLOGY PLC · Game Center</p>
            <div className="my-5 text-center">
              <p className="text-sm text-slate-500">{order.title}</p>
              <p className="mt-1 text-4xl font-bold text-slate-900">{etb(order.amountCents)}</p>
              <p className="mt-1 text-xs text-slate-400">Order {order.merchOrderId}</p>
            </div>
            <p className="text-sm text-slate-600">
              From telebirr account <strong>{displayPhone(user?.phone ?? null)}</strong>
            </p>
            <label htmlFor="pin" className="mt-4 block text-sm font-medium text-slate-700">
              Enter any 4–6 digit PIN to approve
            </label>
            <input
              id="pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              className="input mt-1 text-center text-2xl tracking-[0.5em]"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
            <button className="btn-primary mt-4 w-full text-base" disabled={busy || pin.length < 4} onClick={() => finish(true)}>
              <Lock className="h-4 w-4" aria-hidden /> {busy ? 'Processing…' : `Pay ${etb(order.amountCents)}`}
            </button>
            <button className="btn-ghost mt-2 w-full" disabled={busy} onClick={() => finish(false)}>
              Cancel payment
            </button>
          </>
        )}
        {error && <div className="mt-3"><ErrorNote message={error} /></div>}
      </div>
    </div>
  );
}

export default function MockCheckoutPage() {
  return (
    <Suspense>
      <MockCheckout />
    </Suspense>
  );
}
