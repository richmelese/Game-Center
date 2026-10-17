'use client';

import { ChevronDown, Coins, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell, ErrorNote, Spinner } from '@/components/AppShell';
import { GameArt } from '@/components/GameArt';
import { JourneyList } from '@/components/JourneySteps';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { etb } from '@/lib/format';
import type { Game } from '@/lib/types';

/** Journey step 1 (open the Game Center) and step 2 (discover / select a game). */
export default function GameCenterPage() {
  const { user } = useAuth();
  const [data, setData] = useState<{ categories: string[]; games: Game[] } | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ categories: string[]; games: Game[] }>('/games')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  const games = data?.games.filter((g) => !category || g.category === category) ?? [];
  const fromPrice = (g: Game) => Math.min(...g.plans.filter((p) => p.type !== 'PAY_PER_USE').map((p) => p.priceCents));

  return (
    <AppShell>
      {/* green balance area continuing the header, like the telebirr home screen */}
      <section className="telebirr-waves -mx-4 -mt-4 px-4 pb-5 pt-2 text-white">
        <p className="text-lg">Selam{user?.name ? `, ${user.name}` : ''}</p>
        {user ? (
          <div className="mt-3 flex items-end justify-between">
            <div>
              <p className="text-sm text-white/90">My coins</p>
              <p className="flex items-center gap-2 text-3xl font-semibold">
                <Coins className="h-7 w-7 text-sun" aria-hidden /> {user.coinBalance.toLocaleString()}
              </p>
            </div>
            <Link href="/wallet" className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-leaf-700 shadow-sm">
              Convert to ETB
            </Link>
          </div>
        ) : (
          <p className="mt-2 text-sm text-white/90">
            Subscribe from 3 ETB a day, play as much as you like, and turn the coins you earn into e-money.
          </p>
        )}
      </section>
      <p className="-mx-4 flex items-center gap-1.5 bg-sun px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-900">
        <Sparkles className="h-3.5 w-3.5" aria-hidden /> Play games · earn coins · cash out to telebirr
      </p>

      <details className="card group mt-4 p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-slate-800">
          How it works · 8 steps
          <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className="mt-4">
          <JourneyList completedThrough={1} />
        </div>
      </details>

      <h2 className="mt-6 text-base font-bold text-slate-900">Choose a game</h2>
      {error && <div className="mt-3"><ErrorNote message={error} /></div>}
      {!data && !error && <Spinner label="Loading games…" />}

      {data && (
        <>
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Categories">
            {[null, ...data.categories].map((c) => (
              <button
                key={c ?? 'all'}
                role="tab"
                aria-selected={category === c}
                onClick={() => setCategory(c)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 transition ${
                  category === c ? 'bg-leaf-700 text-white ring-leaf-700' : 'bg-white text-slate-600 ring-slate-200'
                }`}
              >
                {c ?? 'All games'}
              </button>
            ))}
          </div>

          <ul className="mt-4 grid grid-cols-2 gap-3">
            {games.map((g, i) => (
              <li key={g.id}>
                <Link
                  href={`/games/${g.slug}`}
                  className="card group block overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <GameArt
                    slug={g.slug}
                    color={g.themeColor}
                    title={g.title}
                    className="aspect-square transition duration-300 group-hover:brightness-105"
                    priority={i < 4}
                  />
                  <div className="p-3">
                    <h3 className="truncate text-sm font-bold text-slate-900">{g.title}</h3>
                    <p className="truncate text-xs text-slate-500">{g.category}</p>
                    <p className="mt-2 flex items-center justify-between text-xs">
                      <span className="font-semibold text-leaf-700">from {etb(fromPrice(g))}</span>
                      {g.coinMode === 'SCORE' && (
                        <span className="rounded-full bg-sun/25 px-2 py-0.5 font-semibold text-amber-800">Score coins</span>
                      )}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </AppShell>
  );
}
