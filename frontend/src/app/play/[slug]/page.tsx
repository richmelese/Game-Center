'use client';

import { ArrowLeft, Coins, Gamepad2, Timer, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ErrorNote, Spinner } from '@/components/AppShell';
import { JourneyProgress } from '@/components/JourneySteps';
import { api, API_URL, ApiError, tokens } from '@/lib/api';
import { mmss } from '@/lib/format';
import type { CoinMode, PlayMode } from '@/lib/types';
import { useRequireAuth } from '@/lib/use-require-auth';

interface StartResponse {
  sessionId: string;
  mode: PlayMode;
  game: { slug: string; title: string; gameUrl: string };
  heartbeatSeconds: number;
  demoSeconds: number | null;
  coinRules: { coinMode: CoinMode; perMinute: number; pointsPerCoin: number; maxPerSession: number };
}

interface Summary {
  coinsEarned: number;
  coinBalance: number;
  activeSeconds: number;
  reason?: string;
}

/** Journey step 6 (launch and use the game) and step 7 (play and accumulate coins). */
function PlayScreen() {
  const { slug } = useParams<{ slug: string }>();
  const mode: PlayMode = useSearchParams().get('mode') === 'DEMO' ? 'DEMO' : 'FULL';
  const { user, refresh } = useRequireAuth();

  const [session, setSession] = useState<StartResponse | null>(null);
  const [error, setError] = useState<{ message: string; status: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [coinsSoFar, setCoinsSoFar] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ending, setEnding] = useState(false);
  const started = useRef(false);
  const sessionRef = useRef<StartResponse | null>(null);
  const finished = useRef(false);

  // start exactly once (guards against React strict-mode double effects)
  useEffect(() => {
    if (!user || started.current) return;
    started.current = true;
    api<StartResponse>('/play/start', { body: { slug, mode } })
      .then((s) => {
        sessionRef.current = s;
        setSession(s);
      })
      .catch((e: ApiError) => setError({ message: e.message, status: e.status }));
  }, [user, slug, mode]);

  const finish = useCallback(
    async (result?: Summary) => {
      const s = sessionRef.current;
      if (!s || finished.current) return;
      finished.current = true;
      setEnding(true);
      try {
        const r = result ?? (await api<Summary>(`/play/${s.sessionId}/end`, { body: {} }));
        setSummary(r);
        await refresh();
      } catch (e) {
        setError({ message: (e as Error).message, status: 0 });
      } finally {
        setEnding(false);
      }
    },
    [refresh],
  );

  // visible-time clock + server heartbeats (only while the game is on screen)
  useEffect(() => {
    if (!session || summary) return;
    const tick = setInterval(() => {
      if (document.visibilityState === 'visible') setElapsed((e) => e + 1);
    }, 1000);
    const beat = setInterval(async () => {
      if (document.visibilityState !== 'visible' || finished.current) return;
      try {
        const r = await api<{ ended: boolean; coinsSoFar?: number; reason?: string } & Partial<Summary>>(
          `/play/${session.sessionId}/heartbeat`,
          { body: {} },
        );
        if (r.ended) {
          finish({
            coinsEarned: r.coinsEarned ?? 0,
            coinBalance: r.coinBalance ?? 0,
            activeSeconds: r.activeSeconds ?? 0,
            reason: r.reason,
          });
        } else if (typeof r.coinsSoFar === 'number') {
          setCoinsSoFar(r.coinsSoFar);
        }
      } catch {
        /* transient network error: the next heartbeat retries */
      }
    }, session.heartbeatSeconds * 1000);
    return () => {
      clearInterval(tick);
      clearInterval(beat);
    };
  }, [session, summary, finish]);

  // closing the tab / leaving the app still ends the session and books the coins
  useEffect(() => {
    const onHide = () => {
      const s = sessionRef.current;
      if (!s || finished.current) return;
      finished.current = true;
      fetch(`${API_URL}/play/${s.sessionId}/end`, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.customer()}` },
        body: '{}',
      }).catch(() => undefined);
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      onHide(); // navigating away inside the app
    };
  }, []);

  if (error) {
    return (
      <div className="mx-auto min-h-dvh max-w-md space-y-4 px-4 py-6">
        <ErrorNote message={error.message} />
        <Link href={`/games/${slug}`} className="btn-primary w-full">
          {error.status === 402 || error.status === 403 ? 'See plans' : 'Back to the game'}
        </Link>
      </div>
    );
  }

  if (summary) {
    const reason =
      summary.reason === 'DEMO_TIME_UP'
        ? 'Your free demo time is up.'
        : summary.reason === 'SUBSCRIPTION_EXPIRED'
          ? 'Your subscription period has ended.'
          : 'Session ended.';
    return (
      <div className="mx-auto min-h-dvh max-w-md px-4 py-6">
        <JourneyProgress step={summary.coinsEarned > 0 ? 7 : 6} />
        <div className="card mt-4 p-6 text-center">
          <Coins className="mx-auto h-14 w-14 text-coin" aria-hidden />
          <p className="mt-2 text-sm text-slate-500">{reason}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {mode === 'DEMO' ? 'Thanks for trying!' : `+${summary.coinsEarned} coins`}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Played {mmss(summary.activeSeconds)} · balance {summary.coinBalance.toLocaleString()} coins
          </p>
          {mode === 'FULL' && sessionRef.current?.coinRules.coinMode === 'SCORE' && (
            <p className="mt-3 rounded-lg bg-sun/20 px-3 py-2 text-xs text-amber-900">
              Coins for your score are added as the game confirms each round — a round you just finished may appear in
              your wallet a few seconds later.
            </p>
          )}
          {mode === 'DEMO' ? (
            <Link href={`/games/${slug}`} className="btn-primary mt-5 w-full text-base">
              Subscribe to keep playing and earn coins
            </Link>
          ) : (
            <>
              <Link href="/wallet" className="btn-leaf mt-5 w-full text-base">
                <Wallet className="h-5 w-5" aria-hidden /> Convert coins to ETB
              </Link>
              {summary.reason !== 'SUBSCRIPTION_EXPIRED' && (
                <a href={`/play/${slug}?mode=FULL`} className="btn-ghost mt-2 w-full">
                  <Gamepad2 className="h-4 w-4" aria-hidden /> Play again
                </a>
              )}
            </>
          )}
          <Link href="/" className="mt-3 block text-sm font-medium text-brand-600">
            Back to Game Center
          </Link>
        </div>
      </div>
    );
  }

  if (!session) return <Spinner label="Launching game…" />;

  const demoLeft = session.demoSeconds !== null ? Math.max(0, session.demoSeconds - elapsed) : null;

  return (
    <div className="fixed inset-0 flex flex-col bg-black">
      <div className="flex items-center gap-2 bg-leaf-500 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-white">
        <button
          onClick={() => finish()}
          disabled={ending}
          className="flex items-center gap-1 rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/50"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> {ending ? 'Ending…' : 'End'}
        </button>
        <span className="truncate text-sm font-semibold">{session.game.title}</span>
        <span className="ml-auto flex items-center gap-3 text-xs font-semibold">
          {demoLeft !== null ? (
            <span className="flex items-center gap-1 rounded-full bg-sun px-2 py-1 text-slate-900">
              <Timer className="h-3.5 w-3.5" aria-hidden /> Demo {mmss(demoLeft)}
            </span>
          ) : (
            <>
              <span className="flex items-center gap-1 text-white">
                <Timer className="h-3.5 w-3.5" aria-hidden /> {mmss(elapsed)}
              </span>
              <span className="flex items-center gap-1 rounded-full bg-sun px-2 py-1 text-slate-900">
                <Coins className="h-3.5 w-3.5" aria-hidden /> +{coinsSoFar}
              </span>
            </>
          )}
        </span>
      </div>
      <iframe
        src={session.game.gameUrl}
        title={session.game.title}
        className="w-full flex-1 border-0"
        allow="autoplay; fullscreen"
        sandbox="allow-scripts allow-same-origin allow-pointer-lock"
      />
    </div>
  );
}

export default function PlayPage() {
  return (
    <Suspense>
      <PlayScreen />
    </Suspense>
  );
}
