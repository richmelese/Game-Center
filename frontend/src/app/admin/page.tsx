'use client';

import {
  ArrowRightLeft,
  Gamepad2,
  LayoutDashboard,
  LifeBuoy,
  Receipt,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ErrorNote, Spinner } from '@/components/AppShell';
import { API_URL, ApiError, tokens } from '@/lib/api';
import { dateTime, displayPhone, etb, PLAN_LABEL, timeRateText } from '@/lib/format';
import type { CoinMode, CoinSettings, PlanType, Redemption } from '@/lib/types';
import { adminApi, useLoad, type TabProps } from './admin-api';
import { AdminShell, planPriceLabel, type NavItem, type SidebarPricing } from './admin-shell';
import { RevenueTab } from './revenue-tab';

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

const TABS = ['Overview', 'Games & pricing', 'Coin settings', 'Coin conversions', 'Orders', 'Support'] as const;
type Tab = (typeof TABS)[number];
const TAB_ICON: Record<Tab, LucideIcon> = {
  Overview: LayoutDashboard,
  'Games & pricing': Gamepad2,
  'Coin settings': SlidersHorizontal,
  'Coin conversions': ArrowRightLeft,
  Orders: Receipt,
  Support: LifeBuoy,
};
const PLAN_ORDER: PlanType[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'PAY_PER_USE'];

/** Data for the sidebar badges and pricing panel; refreshed whenever the section changes. */
function useSidebarData(onAuthError: (e: unknown) => void, tab: Tab) {
  const [data, setData] = useState<{
    games: AdminGame[];
    pendingConversions: number;
    openTickets: number;
    coins: CoinSettings | null;
  } | null>(null);
  useEffect(() => {
    let stop = false;
    Promise.all([
      adminApi<AdminGame[]>('/admin/games'),
      adminApi<AdminRedemption[]>('/admin/redemptions?status=PENDING'),
      adminApi<AdminTicket[]>('/admin/tickets'),
      adminApi<CoinSettings>('/admin/settings/coins').catch(() => null),
    ])
      .then(([games, pending, tickets, coins]) => {
        if (!stop) {
          setData({
            games,
            pendingConversions: pending.length,
            openTickets: tickets.filter((t) => t.status !== 'RESOLVED').length,
            coins,
          });
        }
      })
      .catch(onAuthError);
    return () => {
      stop = true;
    };
  }, [onAuthError, tab]);
  return data;
}

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('Overview');
  const [search, setSearch] = useState('');
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
  const side = useSidebarData(onAuthError, tab);
  const [profile, setProfile] = useState<{ name: string | null; email: string | null } | null>(null);
  useEffect(() => {
    adminApi<{ name: string | null; email: string | null }>('/auth/me').then(setProfile).catch(onAuthError);
  }, [onAuthError]);

  if (!authed) return <Spinner />;

  const listed = side?.games.filter((g) => g.isActive) ?? [];
  const items: NavItem<Tab>[] = TABS.map((t) => ({
    id: t,
    label: t,
    icon: TAB_ICON[t],
    meta: t === 'Games & pricing' && side ? `${listed.length}/${side.games.length}` : undefined,
    badge:
      t === 'Coin conversions' ? side?.pendingConversions : t === 'Support' ? side?.openTickets : undefined,
  }));
  const pricing: SidebarPricing | null = side
    ? {
        plans: PLAN_ORDER.map((type) => ({
          type,
          label: planPriceLabel(
            listed.flatMap((g) => g.plans.filter((p) => p.type === type && p.isActive).map((p) => p.priceCents)),
          ),
        })),
        coinsPerEtb: side.coins?.coinsPerEtb,
        timeRate: side.coins
          ? { coins: side.coins.coinsPerInterval, minutes: side.coins.intervalMinutes }
          : undefined,
      }
    : null;
  const alerts = (side?.pendingConversions ?? 0) + (side?.openTickets ?? 0);

  return (
    <AdminShell
      items={items}
      active={tab}
      onSelect={setTab}
      pricing={pricing}
      onEditPrices={() => setTab('Games & pricing')}
      search={search}
      onSearch={(q) => {
        setSearch(q);
        if (q.trim()) setTab('Games & pricing');
      }}
      alerts={alerts}
      onAlerts={() => setTab(side?.pendingConversions ? 'Coin conversions' : 'Support')}
      profile={profile}
      onSignOut={() => {
        tokens.setAdmin(null);
        router.replace('/admin/login');
      }}
    >
      {tab === 'Overview' && <RevenueTab onAuthError={onAuthError} onNavigate={setTab} />}
      {tab === 'Games & pricing' && <GamesTab onAuthError={onAuthError} search={search} />}
      {tab === 'Coin settings' && <CoinSettingsTab onAuthError={onAuthError} />}
      {tab === 'Coin conversions' && <ConversionsTab onAuthError={onAuthError} />}
      {tab === 'Orders' && <OrdersTab onAuthError={onAuthError} />}
      {tab === 'Support' && <SupportTab onAuthError={onAuthError} />}
    </AdminShell>
  );
}

function GamesTab({ onAuthError, search = '' }: TabProps & { search?: string }) {
  const { data: allGames, error, load, setError } = useLoad<AdminGame[]>('/admin/games', onAuthError);
  const q = search.trim().toLowerCase();
  const data = allGames && q
    ? allGames.filter((g) => g.title.toLowerCase().includes(q) || g.category.toLowerCase().includes(q))
    : allGames;
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
      {q && (
        <p className="text-sm text-slate-500">
          {data.length === 0 ? `No games match “${search.trim()}”.` : `${data.length} game${data.length === 1 ? '' : 's'} match “${search.trim()}”.`}
        </p>
      )}
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

const COIN_FIELDS: { key: keyof CoinSettings; label: string; hint: string }[] = [
  { key: 'maxPerSession', label: 'Maximum coins per session', hint: 'One game session can never earn more than this' },
  { key: 'maxPerDay', label: 'Maximum coins per day', hint: 'Per customer, all games together (Addis Ababa day)' },
  { key: 'coinsPerEtb', label: 'Coins for 1 ETB', hint: 'Conversion rate in the wallet' },
  { key: 'minRedeem', label: 'Minimum coins to convert', hint: 'Smallest conversion a customer can make' },
];

type CoinForm = Record<
  'coinsPerInterval' | 'intervalMinutes' | 'maxPerSession' | 'maxPerDay' | 'coinsPerEtb' | 'minRedeem',
  string
>;

/** Admin → Coin settings: how many coins are paid for how many minutes of play, limits and conversion. */
function CoinSettingsTab({ onAuthError }: TabProps) {
  const { data, error, setError } = useLoad<CoinSettings>('/admin/settings/coins', onAuthError);
  const [form, setForm] = useState<CoinForm | null>(null);
  const [saved, setSaved] = useState<CoinSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const current = saved ?? data;
  useEffect(() => {
    if (current && !form) {
      setForm({
        coinsPerInterval: String(current.coinsPerInterval),
        intervalMinutes: String(current.intervalMinutes),
        maxPerSession: String(current.maxPerSession),
        maxPerDay: String(current.maxPerDay),
        coinsPerEtb: String(current.coinsPerEtb),
        minRedeem: String(current.minRedeem),
      });
    }
  }, [current, form]);

  if (!current || !form) return error ? <ErrorNote message={error} /> : <Spinner />;

  const n = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Number(v)])) as Record<keyof CoinForm, number>;
  const problems: string[] = [];
  const LABEL: Record<keyof CoinForm, string> = {
    coinsPerInterval: 'Coins paid',
    intervalMinutes: 'Minutes of play',
    maxPerSession: 'Maximum coins per session',
    maxPerDay: 'Maximum coins per day',
    coinsPerEtb: 'Coins for 1 ETB',
    minRedeem: 'Minimum coins to convert',
  };
  for (const k of Object.keys(n) as (keyof CoinForm)[]) {
    if (!Number.isInteger(n[k]) || n[k] < 1) problems.push(`${LABEL[k]} must be a whole number of at least 1`);
  }
  if (n.intervalMinutes > 1440) problems.push('The interval can be at most 1440 minutes (one day)');
  if (n.maxPerDay < n.maxPerSession) problems.push('Coins per day must be at least the coins per session');
  const valid = problems.length === 0;
  const changed = (Object.keys(form) as (keyof CoinForm)[]).some((k) => n[k] !== current[k]);

  // what a customer would earn with the values in the form
  const earn = (minutes: number) =>
    Math.min(Math.floor(minutes / n.intervalMinutes) * n.coinsPerInterval, n.maxPerSession, n.maxPerDay);
  const toEtb = (coins: number) => etb(Math.floor((coins * 100) / n.coinsPerEtb));

  async function save() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await adminApi<CoinSettings>('/admin/settings/coins', { method: 'PUT', body: n });
      setSaved(r);
      setNotice('Saved. The new rules apply to play sessions that end from now on; coins already earned do not change.');
    } catch (e) {
      onAuthError(e);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof CoinForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => (f ? { ...f, [k]: e.target.value.replace(/\D/g, '') } : f));
  const numberInput = (k: keyof CoinForm, label: string, width = 'w-28') => (
    <input id={`coin-${k}`} aria-label={label} className={`input ${width} py-2 text-base`} inputMode="numeric" value={form[k]} onChange={set(k)} />
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section className="card space-y-6 p-5">
        <div>
          <h2 className="text-base font-bold text-slate-900">Coins for play time</h2>
          <p className="text-sm text-slate-500">
            Used by games set to “Play time”. Only verified, on-screen play in purchased sessions counts; demos earn nothing.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-medium text-slate-700">
            Pay {numberInput('coinsPerInterval', 'Coins paid per interval', 'w-24')} coins every
            {numberInput('intervalMinutes', 'Interval length in minutes', 'w-24')} minute(s) of play
          </div>
          {valid && (
            <p className="mt-2 text-sm text-leaf-700">
              = {timeRateText({ coins: n.coinsPerInterval, minutes: n.intervalMinutes })}. A started interval that is not
              finished is not paid.
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {COIN_FIELDS.map((f) => (
            <label key={f.key} htmlFor={`coin-${f.key}`} className="block text-sm font-medium text-slate-700">
              {f.label}
              <div className="mt-1">{numberInput(f.key as keyof CoinForm, f.label, 'w-full')}</div>
              <span className="mt-1 block text-xs font-normal text-slate-500">{f.hint}</span>
            </label>
          ))}
        </div>

        {!valid && (
          <ul className="space-y-1 rounded-xl bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200" role="alert">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
        {error && <ErrorNote message={error} />}
        {notice && <p role="status" className="rounded-xl bg-leaf-50 p-3 text-sm text-leaf-700 ring-1 ring-leaf-400/40">{notice}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={!valid || !changed || busy} onClick={save}>
            {busy ? 'Saving…' : 'Save coin settings'}
          </button>
          {current.updatedAt && (
            <span className="text-xs text-slate-500">
              Last changed {dateTime(current.updatedAt)}
              {current.updatedBy ? ` by ${current.updatedBy}` : ''}
            </span>
          )}
        </div>
      </section>

      <aside className="card h-fit p-5">
        <h3 className="text-sm font-bold text-slate-900">What a customer earns</h3>
        <p className="text-xs text-slate-500">With the values on the left, before saving</p>
        {valid ? (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr><th className="py-1">Play</th><th>Coins</th><th className="text-right">Worth</th></tr>
            </thead>
            <tbody>
              {[5, 10, 30, 60].map((m) => (
                <tr key={m} className="border-t border-slate-100">
                  <td className="py-2">{m} min</td>
                  <td>{earn(m)}{earn(m) === n.maxPerSession && Math.floor(m / n.intervalMinutes) * n.coinsPerInterval > n.maxPerSession ? ' (limit)' : ''}</td>
                  <td className="text-right">{toEtb(earn(m))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-3 text-sm text-slate-400">Fix the values to see the example.</p>
        )}
        {valid && (
          <p className="mt-4 rounded-lg bg-sun/20 p-3 text-xs text-amber-900">
            Most a customer can earn per day: <strong>{n.maxPerDay} coins = {toEtb(n.maxPerDay)}</strong>. Compare
            this with the daily plan price (3.00 ETB) before saving.
          </p>
        )}
      </aside>
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
