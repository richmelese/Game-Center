'use client';

import { ArrowRightLeft, Coins, Info } from 'lucide-react';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { AppShell, ErrorNote, Spinner } from '@/components/AppShell';
import { JourneyProgress } from '@/components/JourneySteps';
import { api } from '@/lib/api';
import { dateTime, displayPhone, etb, timeRateText } from '@/lib/format';
import type { CoinTx, Redemption, Wallet } from '@/lib/types';
import { useRequireAuth } from '@/lib/use-require-auth';

const STATUS_STYLE: Record<Redemption['status'], string> = {
  PAID: 'bg-leaf-500/15 text-leaf-600',
  PENDING: 'bg-amber-100 text-amber-700',
  REJECTED: 'bg-red-100 text-red-700',
};

/** Journey step 8: convert accumulated coins into ETB / e-money. */
function WalletScreen() {
  const { user, refresh } = useRequireAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [txs, setTxs] = useState<CoinTx[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [tab, setTab] = useState<'conversions' | 'coins'>('conversions');
  const [coins, setCoins] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Redemption | null>(null);

  const load = useCallback(async () => {
    const [w, t, r] = await Promise.all([
      api<Wallet>('/wallet'),
      api<CoinTx[]>('/wallet/transactions'),
      api<Redemption[]>('/wallet/redemptions'),
    ]);
    setWallet(w);
    setTxs(t);
    setRedemptions(r);
  }, []);

  useEffect(() => {
    if (user) load().catch((e) => setError(e.message));
  }, [user, load]);

  if (!wallet) {
    return <AppShell title="Wallet">{error ? <ErrorNote message={error} /> : <Spinner />}</AppShell>;
  }

  const { rules } = wallet;
  const amount = Number(coins) || 0;
  const valueCents = Math.floor((amount * 100) / rules.coinsPerEtb);
  const canConvert = wallet.coinBalance >= rules.minRedeemCoins;
  const valid = Number.isInteger(amount) && amount >= rules.minRedeemCoins && amount <= wallet.coinBalance;

  async function convert(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setDone(null);
    try {
      const r = await api<Redemption>('/wallet/convert', { body: { coins: amount } });
      setDone(r);
      setCoins('');
      await Promise.all([load(), refresh()]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Wallet">
      <JourneyProgress step={8} />

      <section className="mt-4 rounded-3xl bg-gradient-to-br from-amber-500 to-orange-600 p-5 text-white shadow-lg">
        <p className="text-sm text-white/85">Your coins</p>
        <p className="mt-1 flex items-center gap-2 text-4xl font-bold">
          <Coins className="h-8 w-8" aria-hidden /> {wallet.coinBalance.toLocaleString()}
        </p>
        <p className="mt-1 text-sm text-white/90">Worth {etb(wallet.etbValueCents)}</p>
        <p className="mt-3 text-xs text-white/80">
          Earned today: {wallet.earnedToday} / {rules.maxCoinsPerDay} coins
        </p>
      </section>

      <form onSubmit={convert} className="card mt-4 p-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
          <ArrowRightLeft className="h-5 w-5 text-leaf-600" aria-hidden /> Convert coins to e-money
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {rules.coinsPerEtb} coins = 1 ETB, sent to your telebirr wallet{' '}
          <strong className="text-slate-700">{displayPhone(wallet.payoutMsisdn)}</strong>.
        </p>
        <label htmlFor="coins" className="mt-4 block text-sm font-medium text-slate-700">
          Coins to convert
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="coins"
            className="input"
            inputMode="numeric"
            placeholder={`min ${rules.minRedeemCoins}`}
            value={coins}
            onChange={(e) => setCoins(e.target.value.replace(/\D/g, ''))}
            disabled={!canConvert}
          />
          <button
            type="button"
            className="btn-ghost shrink-0"
            disabled={!canConvert}
            onClick={() => setCoins(String(wallet.coinBalance))}
          >
            All
          </button>
        </div>
        {amount > 0 && <p className="mt-2 text-sm text-slate-600">You receive <strong>{etb(valueCents)}</strong></p>}
        <button className="btn-leaf mt-3 w-full text-base" disabled={!valid || busy}>
          {busy ? 'Converting…' : 'Convert to ETB'}
        </button>
        {!canConvert && (
          <p className="mt-3 flex gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            <Info className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
            {`You need at least ${rules.minRedeemCoins} coins to convert. Purchased games earn coins for play time (${timeRateText({ coins: rules.coinsPerInterval, minutes: rules.intervalMinutes })}) or for your score, depending on the game — up to ${rules.maxCoinsPerSession} per session and ${rules.maxCoinsPerDay} per day.`}
          </p>
        )}
        {error && <div className="mt-3"><ErrorNote message={error} /></div>}
        {done && (
          <p role="status" className="mt-3 rounded-xl bg-leaf-500/10 p-3 text-sm text-leaf-600">
            {done.status === 'PAID'
              ? `${etb(done.amountCents)} was sent to your telebirr wallet.`
              : `Request received — ${etb(done.amountCents)} will be sent to your telebirr wallet shortly.`}
          </p>
        )}
      </form>

      <div className="mt-6 flex gap-2" role="tablist">
        {(['conversions', 'coins'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 ${
              tab === t ? 'bg-leaf-700 text-white ring-leaf-700' : 'bg-white text-slate-600 ring-slate-200'
            }`}
          >
            {t === 'conversions' ? 'Conversions' : 'Coin history'}
          </button>
        ))}
      </div>

      <ul className="card mt-3 divide-y divide-slate-100">
        {tab === 'conversions' &&
          (redemptions.length ? (
            redemptions.map((r) => (
              <li key={r.id} className="flex items-center justify-between p-4 text-sm">
                <span>
                  <span className="block font-semibold text-slate-900">{etb(r.amountCents)}</span>
                  <span className="text-xs text-slate-500">
                    {r.coins} coins · {dateTime(r.createdAt)}
                  </span>
                </span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[r.status]}`}>
                  {r.status.toLowerCase()}
                </span>
              </li>
            ))
          ) : (
            <li className="p-4 text-sm text-slate-500">No conversions yet.</li>
          ))}
        {tab === 'coins' &&
          (txs.length ? (
            txs.map((t) => (
              <li key={t.id} className="flex items-center justify-between p-4 text-sm">
                <span>
                  <span className="block font-medium text-slate-800">{t.note}</span>
                  <span className="text-xs text-slate-500">{dateTime(t.createdAt)}</span>
                </span>
                <span className={`font-bold ${t.amount > 0 ? 'text-leaf-600' : 'text-slate-700'}`}>
                  {t.amount > 0 ? `+${t.amount}` : t.amount}
                </span>
              </li>
            ))
          ) : (
            <li className="p-4 text-sm text-slate-500">Play a purchased game to start earning coins.</li>
          ))}
      </ul>
    </AppShell>
  );
}

export default function WalletPage() {
  return (
    <Suspense>
      <WalletScreen />
    </Suspense>
  );
}
