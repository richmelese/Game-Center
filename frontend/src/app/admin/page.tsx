'use client';

import { Download, LogOut, RefreshCw } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ErrorNote, Spinner } from '@/components/AppShell';
import { api, API_URL, ApiError, tokens } from '@/lib/api';
import { dateTime, displayPhone, etb, PLAN_LABEL } from '@/lib/format';
import type { CoinMode, PlanType, Redemption } from '@/lib/types';

interface Summary {
  revenue: {
    paidOrders: number;
    grossCents: number;
    vatCents: number;
    otherTaxCents: number;
    netCents: number;
    partnerShareCents: number;
    operatorShareCents: number;
  };
  byPlan: { planType: PlanType; orders: number; grossCents: number }[];
  byGame: { gameId: string; title: string; orders: number; grossCents: number; netCents: number }[];
  users: number;
  activeSubscriptions: number;
  plays: { full: number; demo: number };
  coinsIssued: number;
  redemptions: { status: string; count: number; coins: number; amountCents: number }[];
  openTickets: number;
}
interface Daily { day: string; orders: number; grossCents: number; netCents: number; partnerShareCents: number; operatorShareCents: number }
interface AdminPlan { id: string; type: PlanType; priceCents: number; isActive: boolean }
interface AdminGame {
  id: string; title: string; category: string; isActive: boolean; plans: AdminPlan[];
  coinMode: CoinMode; pointsPerCoin: number; hasResultSecret: boolean;
}
interface AdminRedemption extends Redemption { user: { phone: string | null; name: string | null } }
interface AdminTicket {
  id: string; subject: string; message: string; status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'; response: string | null; createdAt: string;
  user: { phone: string | null; name: string | null };
}
interface OrdersPage {
  total: number; page: number; pageSize: number;
  rows: { merchOrderId: string; status: string; planType: PlanType; game: string; customer: string | null; amountCents: number; providerTxnId: string | null; createdAt: string }[];
}

const TABS = ['Revenue', 'Games & pricing', 'Coin conversions', 'Orders', 'Support'] as const;
type Tab = (typeof TABS)[number];

const isoDay = (d: Date) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
const adminApi = <T,>(path: string, opts: Parameters<typeof api>[1] = {}) => api<T>(path, { ...opts, admin: true });

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('Revenue');
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (!tokens.admin()) router.replace('/admin/login');
    else setAuthed(true);
  }, [router]);

  const onAuthError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        tokens.setAdmin(null);
        router.replace('/admin/login');
      }
    },
    [router],
  );

  if (!authed) return <Spinner />;

  return (
    <div className="min-h-dvh">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Image src="/lemat-mark.png" alt="LEMAT" width={140} height={93} className="h-9 w-auto" />
          <div>
            <p className="text-sm font-bold text-brand-900">telebirr Game Center · Admin</p>
            <p className="text-xs text-slate-500">LEMAT TECHNOLOGY PLC</p>
          </div>
          <button
            className="btn-ghost ml-auto px-3 py-2 text-xs"
            onClick={() => {
              tokens.setAdmin(null);
              router.replace('/admin/login');
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4" role="tablist">
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold ${
                tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {tab === 'Revenue' && <RevenueTab onAuthError={onAuthError} />}
        {tab === 'Games & pricing' && <GamesTab onAuthError={onAuthError} />}
        {tab === 'Coin conversions' && <ConversionsTab onAuthError={onAuthError} />}
        {tab === 'Orders' && <OrdersTab onAuthError={onAuthError} />}
        {tab === 'Support' && <SupportTab onAuthError={onAuthError} />}
      </main>
    </div>
  );
}

type TabProps = { onAuthError: (e: unknown) => void };

function useLoad<T>(path: string, onAuthError: (e: unknown) => void) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    return adminApi<T>(path)
      .then(setData)
      .catch((e) => {
        onAuthError(e);
        setError((e as Error).message);
      });
  }, [path, onAuthError]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, load, setError };
}

function Stat({ label, value, hint, tone = 'slate' }: { label: string; value: string; hint?: string; tone?: 'slate' | 'brand' | 'leaf' }) {
  const color = tone === 'brand' ? 'text-brand-700' : tone === 'leaf' ? 'text-leaf-600' : 'text-slate-900';
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function RevenueTab({ onAuthError }: TabProps) {
  const today = new Date();
  const [from, setFrom] = useState(isoDay(new Date(today.getTime() - 29 * 86400_000)));
  const [to, setTo] = useState(isoDay(today));
  const qs = `from=${from}&to=${to}`;
  const summary = useLoad<Summary>(`/admin/summary?${qs}`, onAuthError);
  const daily = useLoad<Daily[]>(`/admin/revenue/daily?${qs}`, onAuthError);
  const [downloading, setDownloading] = useState(false);

  async function downloadCsv() {
    setDownloading(true);
    try {
      const blob = await adminApi<Blob>(`/admin/revenue.csv?${qs}`, { raw: true });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `telegame-revenue-${from}-to-${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      onAuthError(e);
      summary.setError((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  const s = summary.data;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium text-slate-700">
          From
          <input type="date" className="input mt-1 py-2" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          To
          <input type="date" className="input mt-1 py-2" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button className="btn-ghost py-2.5" onClick={() => { summary.load(); daily.load(); }}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
        </button>
        <button className="btn-primary py-2.5" onClick={downloadCsv} disabled={downloading}>
          <Download className="h-4 w-4" aria-hidden /> {downloading ? 'Preparing…' : 'Reconciliation CSV'}
        </button>
      </div>

      {summary.error && <ErrorNote message={summary.error} />}
      {!s && !summary.error && <Spinner />}
      {s && (
        <>
          <section>
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Revenue sharing (section 3.2)</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Stat label="Gross collected" value={etb(s.revenue.grossCents)} hint={`${s.revenue.paidOrders} paid orders`} />
              <Stat label="VAT" value={etb(s.revenue.vatCents)} />
              <Stat label="Other statutory taxes" value={etb(s.revenue.otherTaxCents)} />
              <Stat label="Net revenue" value={etb(s.revenue.netCents)} tone="brand" />
              <Stat label="LEMAT TECHNOLOGY PLC (70%)" value={etb(s.revenue.partnerShareCents)} tone="leaf" />
              <Stat label="Ethio Telecom (30%)" value={etb(s.revenue.operatorShareCents)} tone="brand" />
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Customers" value={s.users.toLocaleString()} />
            <Stat label="Active subscriptions" value={s.activeSubscriptions.toLocaleString()} />
            <Stat label="Paid plays / demo plays" value={`${s.plays.full} / ${s.plays.demo}`} />
            <Stat label="Coins issued" value={s.coinsIssued.toLocaleString()} />
            <Stat label="Open support tickets" value={String(s.openTickets)} />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card overflow-x-auto p-4">
              <h3 className="text-sm font-bold text-slate-900">By plan</h3>
              <table className="mt-3 w-full text-sm">
                <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Plan</th><th>Orders</th><th className="text-right">Gross</th></tr></thead>
                <tbody>
                  {s.byPlan.length === 0 && <tr><td colSpan={3} className="py-2 text-slate-400">No sales in this period</td></tr>}
                  {s.byPlan.map((p) => (
                    <tr key={p.planType} className="border-t border-slate-100">
                      <td className="py-2">{PLAN_LABEL[p.planType]}</td><td>{p.orders}</td><td className="text-right">{etb(p.grossCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="card overflow-x-auto p-4">
              <h3 className="text-sm font-bold text-slate-900">By game</h3>
              <table className="mt-3 w-full text-sm">
                <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Game</th><th>Orders</th><th className="text-right">Gross</th><th className="text-right">Net</th></tr></thead>
                <tbody>
                  {s.byGame.length === 0 && <tr><td colSpan={4} className="py-2 text-slate-400">No sales in this period</td></tr>}
                  {s.byGame.map((g) => (
                    <tr key={g.gameId} className="border-t border-slate-100">
                      <td className="py-2">{g.title}</td><td>{g.orders}</td><td className="text-right">{etb(g.grossCents)}</td><td className="text-right">{etb(g.netCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <section className="card overflow-x-auto p-4">
            <h3 className="text-sm font-bold text-slate-900">Daily revenue (Addis Ababa time)</h3>
            <table className="mt-3 w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr><th className="py-1">Day</th><th>Orders</th><th className="text-right">Gross</th><th className="text-right">Net</th><th className="text-right">LEMAT 70%</th><th className="text-right">Ethio Telecom 30%</th></tr>
              </thead>
              <tbody>
                {daily.data?.length === 0 && <tr><td colSpan={6} className="py-2 text-slate-400">No sales in this period</td></tr>}
                {daily.data?.map((d) => (
                  <tr key={d.day} className="border-t border-slate-100">
                    <td className="py-2">{d.day}</td><td>{d.orders}</td><td className="text-right">{etb(d.grossCents)}</td><td className="text-right">{etb(d.netCents)}</td>
                    <td className="text-right">{etb(d.partnerShareCents)}</td><td className="text-right">{etb(d.operatorShareCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card p-4">
            <h3 className="text-sm font-bold text-slate-900">Coin conversions in this period</h3>
            <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
              {s.redemptions.map((r) => (
                <div key={r.status}>
                  <p className="text-xs text-slate-500">{r.status.toLowerCase()}</p>
                  <p className="font-bold text-slate-900">{etb(r.amountCents)}</p>
                  <p className="text-xs text-slate-400">{r.count} requests · {r.coins.toLocaleString()} coins</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function GamesTab({ onAuthError }: TabProps) {
  const { data, error, load, setError } = useLoad<AdminGame[]>('/admin/games', onAuthError);
  const [prices, setPrices] = useState<Record<string, string>>({});

  async function patch(path: string, body: unknown) {
    try {
      await adminApi(path, { method: 'PATCH', body });
      await load();
    } catch (e) {
      onAuthError(e);
      setError((e as Error).message);
    }
  }

  if (!data) return error ? <ErrorNote message={error} /> : <Spinner />;
  return (
    <div className="space-y-4">
      {error && <ErrorNote message={error} />}
      {data.map((g) => (
        <section key={g.id} className="card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h3 className="font-bold text-slate-900">{g.title}</h3>
              <p className="text-xs text-slate-500">{g.category}</p>
            </div>
            <label className="ml-auto flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" className="h-4 w-4" checked={g.isActive} onChange={(e) => patch(`/admin/games/${g.id}`, { isActive: e.target.checked })} />
              Listed in Game Center
            </label>
          </div>
          <CoinSettings game={g} onPatch={(body) => patch(`/admin/games/${g.id}`, body)} onAuthError={onAuthError} onError={setError} />
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            {g.plans.map((p) => {
              const draft = prices[p.id] ?? (p.priceCents / 100).toFixed(2);
              const cents = Math.round(Number(draft) * 100);
              const changed = cents !== p.priceCents;
              return (
                <div key={p.id} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-600">{PLAN_LABEL[p.type]}</p>
                  <div className="mt-1 flex items-center gap-1">
                    <input
                      aria-label={`${g.title} ${PLAN_LABEL[p.type]} price in ETB`}
                      className="input px-2 py-1.5 text-sm"
                      inputMode="decimal"
                      value={draft}
                      onChange={(e) => setPrices((x) => ({ ...x, [p.id]: e.target.value }))}
                    />
                    <span className="text-xs text-slate-500">ETB</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-xs text-slate-600">
                      <input type="checkbox" checked={p.isActive} onChange={(e) => patch(`/admin/plans/${p.id}`, { isActive: e.target.checked })} />
                      On sale
                    </label>
                    {changed && Number.isFinite(cents) && cents >= 100 && (
                      <button
                        className="text-xs font-semibold text-brand-600"
                        onClick={async () => {
                          await patch(`/admin/plans/${p.id}`, { priceCents: cents });
                          setPrices((x) => { const n = { ...x }; delete n[p.id]; return n; });
                        }}
                      >
                        Save
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

interface ReportedResult {
  id: string; game: string; resultId: string; sessionId: string; score: number;
  level: number | null; won: boolean | null; coinsAwarded: number; createdAt: string;
}

/**
 * How a game pays coins. SCORE needs a result secret shared with the game supplier
 * (see docs/GAME-RESULTS-API.md); the secret is displayed only once, right after it is generated.
 */
function CoinSettings({
  game,
  onPatch,
  onAuthError,
  onError,
}: {
  game: AdminGame;
  onPatch: (body: Record<string, unknown>) => Promise<void>;
  onAuthError: (e: unknown) => void;
  onError: (message: string) => void;
}) {
  const [ppc, setPpc] = useState(String(game.pointsPerCoin));
  const [secret, setSecret] = useState<{ value: string; url: string } | null>(null);
  const [results, setResults] = useState<ReportedResult[] | null>(null);
  const ppcNumber = Number(ppc);
  const ppcChanged = Number.isInteger(ppcNumber) && ppcNumber >= 1 && ppcNumber !== game.pointsPerCoin;

  async function generateSecret() {
    if (
      game.hasResultSecret &&
      !window.confirm('Rotate the secret? The supplier’s current secret stops working immediately.')
    ) {
      return;
    }
    try {
      const r = await adminApi<{ resultSecret: string; reportUrl: string }>(`/admin/games/${game.id}/result-secret`, {
        body: {},
      });
      setSecret({ value: r.resultSecret, url: `${API_URL.replace(/\/api$/, '')}${r.reportUrl}` });
      await onPatch({}); // refresh "secret set" state
    } catch (e) {
      onAuthError(e);
      onError((e as Error).message);
    }
  }

  async function toggleResults() {
    if (results) return setResults(null);
    try {
      setResults(await adminApi<ReportedResult[]>(`/admin/results?gameId=${game.id}`));
    } catch (e) {
      onAuthError(e);
      onError((e as Error).message);
    }
  }

  return (
    <div className="mt-3 rounded-xl bg-leaf-50 p-3 text-sm ring-1 ring-leaf-400/30">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-leaf-700">Coins</span>
        <select
          aria-label={`${game.title} coin mode`}
          className="input w-auto py-1.5 text-sm"
          value={game.coinMode}
          onChange={(e) => onPatch({ coinMode: e.target.value })}
        >
          <option value="TIME">Play time (verified by the server)</option>
          <option value="SCORE" disabled={!game.hasResultSecret}>
            Score reported by the game supplier{game.hasResultSecret ? '' : ' — generate a secret first'}
          </option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input
            className="input w-24 px-2 py-1.5 text-sm"
            inputMode="numeric"
            value={ppc}
            onChange={(e) => setPpc(e.target.value.replace(/\D/g, ''))}
            aria-label={`${game.title} points per coin`}
          />
          points = 1 coin
        </label>
        {ppcChanged && (
          <button className="text-xs font-semibold text-brand-600" onClick={() => onPatch({ pointsPerCoin: ppcNumber })}>
            Save
          </button>
        )}
        <span className="ml-auto flex gap-3">
          <button className="text-xs font-semibold text-brand-600" onClick={generateSecret}>
            {game.hasResultSecret ? 'Rotate result secret' : 'Generate result secret'}
          </button>
          <button className="text-xs font-semibold text-brand-600" onClick={toggleResults}>
            {results ? 'Hide results' : 'Recent results'}
          </button>
        </span>
      </div>

      {secret && (
        <div className="mt-3 rounded-lg bg-white p-3 ring-1 ring-amber-300">
          <p className="text-xs font-semibold text-amber-800">
            Copy this now — it will not be shown again. Send it to the game supplier over a secure channel.
          </p>
          <p className="mt-2 text-xs text-slate-500">Report URL</p>
          <code className="block break-all text-xs">{secret.url}</code>
          <p className="mt-2 text-xs text-slate-500">Result secret</p>
          <code className="block break-all font-mono text-xs">{secret.value}</code>
          <div className="mt-2 flex gap-3">
            <button
              className="text-xs font-semibold text-brand-600"
              onClick={() => navigator.clipboard?.writeText(secret.value)}
            >
              Copy secret
            </button>
            <button className="text-xs font-semibold text-slate-500" onClick={() => setSecret(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      {results && (
        <div className="mt-3 overflow-x-auto rounded-lg bg-white">
          <table className="w-full min-w-[560px] text-xs">
            <thead className="text-left text-slate-500">
              <tr><th className="p-2">Received</th><th>Result id</th><th>Score</th><th>Level</th><th>Won</th><th className="p-2 text-right">Coins</th></tr>
            </thead>
            <tbody>
              {results.length === 0 && <tr><td colSpan={6} className="p-2 text-slate-400">No results reported yet</td></tr>}
              {results.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="p-2">{dateTime(r.createdAt)}</td><td className="font-mono">{r.resultId}</td>
                  <td>{r.score.toLocaleString()}</td><td>{r.level ?? '—'}</td><td>{r.won === null ? '—' : r.won ? 'yes' : 'no'}</td>
                  <td className="p-2 text-right font-semibold">{r.coinsAwarded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ConversionsTab({ onAuthError }: TabProps) {
  const [status, setStatus] = useState<'PENDING' | 'PAID' | 'REJECTED' | ''>('PENDING');
  const { data, error, load, setError } = useLoad<AdminRedemption[]>(`/admin/redemptions${status ? `?status=${status}` : ''}`, onAuthError);

  async function act(id: string, action: 'pay' | 'reject') {
    const value =
      action === 'pay'
        ? window.prompt('telebirr payout transaction reference')
        : window.prompt('Reason for rejecting (the coins are returned to the customer)');
    if (!value) return;
    try {
      await adminApi(`/admin/redemptions/${id}/${action}`, { body: action === 'pay' ? { payoutRef: value } : { note: value } });
      await load();
    } catch (e) {
      onAuthError(e);
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['PENDING', 'PAID', 'REJECTED', ''] as const).map((s) => (
          <button key={s || 'all'} onClick={() => setStatus(s)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${status === s ? 'bg-leaf-700 text-white ring-leaf-700' : 'bg-white text-slate-600 ring-slate-200'}`}>
            {s ? s.toLowerCase() : 'all'}
          </button>
        ))}
      </div>
      {error && <ErrorNote message={error} />}
      {!data ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr><th className="p-3">Requested</th><th>Customer / wallet</th><th>Coins</th><th>Amount</th><th>Status</th><th className="p-3 text-right">Action</th></tr>
            </thead>
            <tbody>
              {data.length === 0 && <tr><td colSpan={6} className="p-3 text-slate-400">Nothing here</td></tr>}
              {data.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="p-3">{dateTime(r.createdAt)}</td>
                  <td>{r.user.name ?? ''} {displayPhone(r.msisdn)}</td>
                  <td>{r.coins.toLocaleString()}</td>
                  <td className="font-semibold">{etb(r.amountCents)}</td>
                  <td>{r.status.toLowerCase()}{r.payoutRef && <span className="block text-xs text-slate-400">{r.payoutRef}</span>}</td>
                  <td className="p-3 text-right">
                    {r.status === 'PENDING' && (
                      <span className="flex justify-end gap-2">
                        <button className="btn-leaf px-3 py-1.5 text-xs" onClick={() => act(r.id, 'pay')}>Mark paid</button>
                        <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => act(r.id, 'reject')}>Reject</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OrdersTab({ onAuthError }: TabProps) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const { data, error } = useLoad<OrdersPage>(`/admin/orders?page=${page}${status ? `&status=${status}` : ''}`, onAuthError);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <select className="input w-auto py-2" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter by status">
        <option value="">All statuses</option>
        {['PAID', 'PENDING', 'FAILED', 'CANCELLED'].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
      </select>
      {error && <ErrorNote message={error} />}
      {!data ? <Spinner /> : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr><th className="p-3">Order</th><th>Created</th><th>Customer</th><th>Game</th><th>Plan</th><th>Amount</th><th>Status</th><th className="p-3">telebirr txn</th></tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && <tr><td colSpan={8} className="p-3 text-slate-400">No orders</td></tr>}
                {data.rows.map((o) => (
                  <tr key={o.merchOrderId} className="border-t border-slate-100">
                    <td className="p-3 font-mono text-xs">{o.merchOrderId}</td><td>{dateTime(o.createdAt)}</td><td>{o.customer}</td><td>{o.game}</td>
                    <td>{PLAN_LABEL[o.planType]}</td><td>{etb(o.amountCents)}</td><td>{o.status.toLowerCase()}</td><td className="p-3 font-mono text-xs">{o.providerTxnId ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>{data.total} orders</span>
            <span className="flex items-center gap-2">
              <button className="btn-ghost px-3 py-1.5" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              {page} / {pages}
              <button className="btn-ghost px-3 py-1.5" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function SupportTab({ onAuthError }: TabProps) {
  const { data, error, load, setError } = useLoad<AdminTicket[]>('/admin/tickets', onAuthError);
  const [replies, setReplies] = useState<Record<string, string>>({});

  async function update(id: string, body: { status?: string; response?: string }) {
    try {
      await adminApi(`/admin/tickets/${id}`, { method: 'PATCH', body });
      await load();
    } catch (e) {
      onAuthError(e);
      setError((e as Error).message);
    }
  }

  if (!data) return error ? <ErrorNote message={error} /> : <Spinner />;
  return (
    <div className="space-y-3">
      {error && <ErrorNote message={error} />}
      {data.length === 0 && <p className="text-sm text-slate-500">No support requests.</p>}
      {data.map((t) => (
        <section key={t.id} className="card p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-slate-900">{t.subject}</h3>
            <span className="text-xs text-slate-500">{t.user.name ?? ''} {displayPhone(t.user.phone)} · {dateTime(t.createdAt)}</span>
            <select
              className="input ml-auto w-auto py-1.5 text-sm"
              value={t.status}
              onChange={(e) => update(t.id, { status: e.target.value })}
              aria-label="Ticket status"
            >
              <option value="OPEN">open</option><option value="IN_PROGRESS">in progress</option><option value="RESOLVED">resolved</option>
            </select>
          </div>
          <p className="mt-2 text-slate-700">{t.message}</p>
          {t.response && <p className="mt-2 rounded-lg bg-brand-50 p-2 text-brand-900"><strong>Reply:</strong> {t.response}</p>}
          <div className="mt-3 flex gap-2">
            <input
              className="input py-2 text-sm"
              placeholder="Write a reply to the customer"
              value={replies[t.id] ?? ''}
              onChange={(e) => setReplies((r) => ({ ...r, [t.id]: e.target.value }))}
            />
            <button
              className="btn-primary px-4 py-2"
              disabled={!replies[t.id]?.trim()}
              onClick={async () => {
                await update(t.id, { response: replies[t.id].trim(), status: 'RESOLVED' });
                setReplies((r) => ({ ...r, [t.id]: '' }));
              }}
            >
              Reply
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}
