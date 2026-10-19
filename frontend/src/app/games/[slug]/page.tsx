'use client';

import { Check, Clock, Coins, Play, ShieldCheck, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell, ErrorNote, Spinner } from '@/components/AppShell';
import { GameArt } from '@/components/GameArt';
import { JourneyProgress } from '@/components/JourneySteps';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { coinRuleText, dateTime, etb, PLAN_LABEL, PLAN_PERIOD } from '@/lib/format';
import type { Game, GameAccess, Plan, TimeCoins } from '@/lib/types';

type Detail = Game & { access: GameAccess | null; timeCoins: TimeCoins };

/** Journey step 2 (select the game) and step 3 (purchase / subscription flow). */
export default function GamePage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, ready } = useAuth();
  const router = useRouter();
  const [game, setGame] = useState<Detail | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ready) return;
    api<Detail>(`/games/${slug}`)
      .then((g) => {
        setGame(g);
        setSelected((s) => s ?? g.plans.find((p) => p.type === 'WEEKLY')?.id ?? g.plans[0]?.id ?? null);
      })
      .catch((e) => setError(e.message));
  }, [slug, ready, user]);

  const requireLogin = () => router.push(`/login?next=${encodeURIComponent(`/games/${slug}`)}`);

  async function subscribe(plan: Plan) {
    if (!user) return requireLogin();
    setBusy(true);
    setError('');
    try {
      const r = await api<{ checkoutUrl: string }>('/payments/checkout', { body: { planId: plan.id } });
      window.location.href = r.checkoutUrl; // step 4 happens on telebirr
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (error && !game) return <AppShell><ErrorNote message={error} /></AppShell>;
  if (!game) return <AppShell><Spinner /></AppShell>;

  const access = game.access;
  const plan = game.plans.find((p) => p.id === selected);

  return (
    <AppShell title={game.title}>
      <JourneyProgress step={access?.hasAccess ? 6 : plan ? 3 : 2} />

      <div className="card mt-4 overflow-hidden">
        <GameArt slug={game.slug} color={game.themeColor} title={game.title} className="h-52" iconClassName="h-16 w-16" fit="contain" sizes="448px" priority />
        <div className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{game.category}</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900">{game.title}</h1>
          <p className="mt-2 text-sm text-slate-600">{game.description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              <Users className="h-3.5 w-3.5" aria-hidden /> {game.targetAudience}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sun/25 px-2.5 py-1 text-xs font-medium text-amber-800">
              <Coins className="h-3.5 w-3.5" aria-hidden /> {coinRuleText(game.coinMode, game.pointsPerCoin, game.timeCoins)}
            </span>
          </div>
        </div>
      </div>

      {access?.hasAccess && (
        <div className="card mt-4 border-l-4 border-leaf-500 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-leaf-600">
            <ShieldCheck className="h-5 w-5" aria-hidden /> You have access
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {access.subscription
              ? `${PLAN_LABEL[access.subscription.type]} plan · until ${dateTime(access.subscription.expiresAt)}`
              : `${access.playsRemaining} paid play${access.playsRemaining === 1 ? '' : 's'} left`}
          </p>
          <Link href={`/play/${game.slug}?mode=FULL`} className="btn-leaf mt-3 w-full text-base">
            <Play className="h-5 w-5" aria-hidden /> Launch game
          </Link>
          <p className="mt-2 text-center text-xs text-slate-500">{coinRuleText(game.coinMode, game.pointsPerCoin, game.timeCoins)}</p>
        </div>
      )}

      <section className="mt-6">
        <h2 className="text-base font-bold text-slate-900">
          {access?.hasAccess ? 'Extend your access' : 'Choose how you want to play'}
        </h2>
        <div className="mt-3 space-y-2" role="radiogroup" aria-label="Plans">
          {game.plans.map((p) => (
            <button
              key={p.id}
              role="radio"
              aria-checked={selected === p.id}
              onClick={() => setSelected(p.id)}
              className={`card flex w-full items-center gap-3 p-4 text-left transition ${
                selected === p.id ? 'ring-2 ring-leaf-500' : ''
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                  selected === p.id ? 'border-leaf-500 bg-leaf-500 text-white' : 'border-slate-300'
                }`}
              >
                {selected === p.id && <Check className="h-3 w-3" aria-hidden />}
              </span>
              <span className="flex-1">
                <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  {PLAN_LABEL[p.type]}
                  {p.type === 'WEEKLY' && (
                    <span className="rounded-full bg-leaf-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-leaf-600">
                      Popular
                    </span>
                  )}
                </span>
                <span className="block text-xs text-slate-500">{PLAN_PERIOD[p.type]}</span>
              </span>
              <span className="text-base font-bold text-brand-700">{etb(p.priceCents)}</span>
            </button>
          ))}
        </div>

        {error && <div className="mt-3"><ErrorNote message={error} /></div>}

        <button
          className="btn-primary mt-4 w-full text-base"
          disabled={!plan || busy}
          onClick={() => plan && subscribe(plan)}
        >
          {busy ? 'Opening telebirr…' : plan ? `Pay ${etb(plan.priceCents)} with telebirr` : 'Select a plan'}
        </button>
        <p className="mt-2 text-center text-xs text-slate-500">Prices include VAT. Payment is processed by telebirr.</p>
      </section>

      {!access?.hasAccess && (
        <section className="card mt-6 p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Clock className="h-4 w-4 text-brand-600" aria-hidden /> Try it first — free demo
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Play for {Math.round((access?.demoSeconds ?? 180) / 60)} minutes before you buy. Demo plays do not earn coins.
          </p>
          {user ? (
            access && access.demoPlaysLeft > 0 ? (
              <Link href={`/play/${game.slug}?mode=DEMO`} className="btn-ghost mt-3 w-full">
                Play free demo ({access.demoPlaysLeft} left today)
              </Link>
            ) : (
              <p className="mt-3 text-sm font-medium text-slate-500">You have used today&apos;s free demos for this game.</p>
            )
          ) : (
            <button onClick={requireLogin} className="btn-ghost mt-3 w-full">
              Log in to play the free demo
            </button>
          )}
        </section>
      )}
    </AppShell>
  );
}
