'use client';

import { ChevronDown, ChevronRight, Coins, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { AppShell, ErrorNote, Spinner } from '@/components/AppShell';
import { GameArt } from '@/components/GameArt';
import { JourneyList } from '@/components/JourneySteps';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/use-require-auth';
import { etb } from '@/lib/format';
import type { Game } from '@/lib/types';

const FEATURED = 'Featured';

const fromPrice = (g: Game) =>
  Math.min(...g.plans.filter((p) => p.type !== 'PAY_PER_USE').map((p) => p.priceCents));

function GameCard({ g, priority }: { g: Game; priority?: boolean }) {
  return (
    <Link
      href={`/games/${g.slug}`}
      className="card group block overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <GameArt
        slug={g.slug}
        image={g.imageUrl}
        color={g.themeColor}
        title={g.title}
        className="aspect-square transition duration-300 group-hover:brightness-105"
        priority={priority}
      />
      <div className="p-3">
        <h4 className="truncate text-sm font-bold text-slate-900">{g.title}</h4>
        <p className="mt-1 flex items-center justify-between gap-1 text-xs">
          <span className="font-semibold text-leaf-700">from {etb(fromPrice(g))}</span>
          {g.coinMode === 'SCORE' && (
            <span className="rounded-full bg-sun/25 px-2 py-0.5 font-semibold text-amber-800">Score</span>
          )}
        </p>
      </div>
    </Link>
  );
}

/** Journey step 1 (open the Game Center) and step 2 (discover / select a game). */
function GameCenter() {
  const { user } = useRequireAuth();
  const [data, setData] = useState<{ categories: string[]; games: Game[] } | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return; // the catalog requires a login
    api<{ categories: string[]; games: Game[] }>('/games')
      .then(setData)
      .catch((e) => setError(e.message));
  }, [user]);

  // categories that have games, biggest first; each keeps its games in catalog order.
  // Categories with a single game are combined into one "Featured" row shown first.
  const groups = useMemo(() => {
    if (!data) return [];
    const byCategory = new Map<string, Game[]>();
    for (const g of data.games) byCategory.set(g.category, [...(byCategory.get(g.category) ?? []), g]);
    const all = [...byCategory.entries()].map(([name, games]) => ({ name, games }));
    const featured = all.filter((c) => c.games.length === 1).flatMap((c) => c.games);
    const rest = all
      .filter((c) => c.games.length > 1)
      .sort((a, b) => b.games.length - a.games.length || a.name.localeCompare(b.name));
    return featured.length ? [{ name: FEATURED, games: featured }, ...rest] : rest;
  }, [data]);
  const selected = groups.find((g) => g.name === category) ?? null;
  const show = (name: string | null) => {
    setCategory(name);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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
        <Sparkles className="h-3.5 w-3.5" aria-hidden /> Play games · earn coins · convert to ETB e-money
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
            {[null, ...groups.map((g) => g.name)].map((c) => (
              <button
                key={c ?? 'all'}
                role="tab"
                aria-selected={category === c}
                onClick={() => setCategory(c)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 transition ${
                  category === c ? 'bg-leaf-700 text-white ring-leaf-700' : 'bg-white text-slate-600 ring-slate-200'
                }`}
              >
                {c ?? `All games · ${data.games.length}`}
              </button>
            ))}
          </div>

          {selected ? (
            /* one category: its name as the heading, all of its games in a grid */
            <section className="mt-5" aria-labelledby="category-heading">
              <div className="flex items-end justify-between">
                <div>
                  <h3 id="category-heading" className="text-lg font-bold text-slate-900">
                    {selected.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {selected.games.length} game{selected.games.length === 1 ? '' : 's'}
                  </p>
                </div>
                <button onClick={() => show(null)} className="text-xs font-semibold text-brand-600">
                  All categories
                </button>
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-3">
                {selected.games.map((g, i) => (
                  <li key={g.id}>
                    <GameCard g={g} priority={i < 4} />
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            /* all games: one section per category, headed by the category name */
            groups.map((group, gi) => (
              <section key={group.name} className="mt-6" aria-labelledby={`category-${gi}`}>
                <div className="flex items-end justify-between">
                  <h3 id={`category-${gi}`} className="text-base font-bold text-slate-900">
                    {group.name} <span className="text-xs font-medium text-slate-400">· {group.games.length}</span>
                  </h3>
                  {group.games.length > 2 && (
                    <button
                      onClick={() => show(group.name)}
                      className="flex items-center text-xs font-semibold text-brand-600"
                      aria-label={`See all ${group.name} games`}
                    >
                      See all <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                </div>
                <ul className="-mx-4 mt-2 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
                  {group.games.slice(0, 12).map((g, i) => (
                    <li key={g.id} className="w-36 shrink-0 snap-start">
                      <GameCard g={g} priority={gi === 0 && i < 3} />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </AppShell>
  );
}

export default function GameCenterPage() {
  return (
    <Suspense>
      <GameCenter />
    </Suspense>
  );
}
