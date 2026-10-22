'use client';

import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  Gamepad2,
  LifeBuoy,
  RefreshCw,
  Users,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { ErrorNote, Spinner } from '@/components/AppShell';
import { GameArt } from '@/components/GameArt';
import { etb, PLAN_LABEL } from '@/lib/format';
import type { CoinSettings, PlanType } from '@/lib/types';
import { adminApi, isoDay, useLoad, type TabProps } from './admin-api';


const C = {
  lemat: '#2a78d6',
  telecom: '#eb6834',
  vat: '#c3c2b7',
  otherTax: '#898781',
  grid: '#e1e0d9',
  baseline: '#c3c2b7',
  muted: '#898781',
  good: '#0ca30c',
  warning: '#c98500',
  critical: '#d03b3b',
};
const PLAN_COLOR: Record<PlanType, string> = {
  DAILY: '#1baf7a',
  WEEKLY: '#6250d6',
  MONTHLY: '#e87ba4',
  PAY_PER_USE: '#eda100',
};
const PLAN_ORDER: PlanType[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'PAY_PER_USE'];
const PLAN_UNIT: Record<PlanType, string> = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', PAY_PER_USE: 'play' };

interface Split {
  netCents: number;
  partnerShareCents: number;
  operatorShareCents: number;
}
interface Summary {
  revenue: Split & { paidOrders: number; grossCents: number; vatCents: number; otherTaxCents: number };
  byPlan: (Split & { planType: PlanType; orders: number; grossCents: number })[];
  byGame: (Split & { gameId: string; slug: string; imageUrl: string | null; title: string; orders: number; grossCents: number })[];
  users: number;
  activeSubscriptions: number;
  plays: { full: number; demo: number };
  coinsIssued: number;
  redemptions: { status: 'PENDING' | 'PAID' | 'REJECTED'; count: number; coins: number; amountCents: number }[];
  openTickets: number;
}
interface Daily extends Split {
  day: string;
  orders: number;
  grossCents: number;
}
type NavTarget = 'Coin conversions' | 'Support' | 'Games & pricing';

// ---------- dates ----------
const DAY_MS = 86_400_000;
const addDays = (iso: string, n: number) =>
  isoDay(new Date(new Date(`${iso}T12:00:00+03:00`).getTime() + n * DAY_MS));
const dayCount = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
const shortDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const longDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

type Preset = '7' | '30' | '90' | 'month' | 'custom';
const PRESETS: { id: Exclude<Preset, 'custom'>; label: string }[] = [
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
  { id: 'month', label: 'This month' },
];
function presetRange(p: Exclude<Preset, 'custom'>) {
  const to = isoDay(new Date());
  return { from: p === 'month' ? `${to.slice(0, 8)}01` : addDays(to, -(Number(p) - 1)), to };
}

// ---------- numbers ----------
const amount = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M` : n >= 10_000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K` : n.toLocaleString();
const pctOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
/** 1, 2, 5 x 10^n step so axis ticks are round numbers */
function niceStep(x: number) {
  const exp = 10 ** Math.floor(Math.log10(x));
  const f = x / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

/** Change vs the previous period, as chip text + tone. */
function change(cur: number, prev: number | undefined, upIsGood: boolean | null = true) {
  if (prev === undefined) return null;
  if (prev === 0) return cur > 0 ? { text: 'New', tone: 'neutral' as const, icon: null } : null;
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) < 0.5) return { text: '0%', tone: 'neutral' as const, icon: null };
  const up = pct > 0;
  const tone = upIsGood === null ? ('neutral' as const) : up === upIsGood ? ('up' as const) : ('down' as const);
  return { text: `${up ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`, tone, icon: up ? ArrowUpRight : ArrowDownRight };
}
const CHIP_TONE = {
  up: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  down: 'bg-red-50 text-red-700 ring-red-200',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
  info: 'bg-amber-50 text-amber-800 ring-amber-200',
};

// ---------- small pieces ----------
function Chip({ text, tone, icon: Icon }: { text: string; tone: keyof typeof CHIP_TONE; icon?: LucideIcon | null }) {
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${CHIP_TONE[tone]}`}>
      {Icon && <Icon className="h-3 w-3" aria-hidden />}
      {text}
    </span>
  );
}

const CORNER = {
  leaf: 'bg-leaf-400/15',
  blue: 'bg-brand-500/10',
  violet: 'bg-violet-500/10',
  amber: 'bg-amber-400/15',
};
/** KPI card: label + change chip, big value, short note, soft corner circle. */
function KpiCard({
  label,
  value,
  unit,
  note,
  chip,
  corner,
}: {
  label: string;
  value: string;
  unit?: string;
  note: string;
  chip?: { text: string; tone: keyof typeof CHIP_TONE; icon?: LucideIcon | null } | null;
  corner: keyof typeof CORNER;
}) {
  return (
    <div className="card relative overflow-hidden p-5">
      <span className={`pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full ${CORNER[corner]}`} aria-hidden />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        {chip && <Chip {...chip} />}
      </div>
      <p className="relative mt-3 text-3xl font-bold tracking-tight text-slate-900">
        {value}
        {unit && <span className="ml-1 text-base font-semibold text-slate-400">{unit}</span>}
      </p>
      <p className="relative mt-2 text-xs text-slate-500">{note}</p>
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
const SHARE_LEGEND = [
  { label: 'LEMAT share 70%', color: C.lemat },
  { label: 'Ethio Telecom 30%', color: C.telecom },
];

/** Horizontal part-to-whole bar: 2px surface gaps between segments, no borders. */
function SplitBar({ parts, height = 'h-3' }: { parts: { key: string; cents: number; color: string }[]; height?: string }) {
  const shown = parts.filter((p) => p.cents > 0);
  return (
    <div className={`flex w-full gap-[2px] overflow-hidden rounded-full ${height}`} aria-hidden>
      {shown.map((p) => (
        <span key={p.key} style={{ flex: `${p.cents} 1 0`, background: p.color, minWidth: 3 }} />
      ))}
    </div>
  );
}

function CardHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

// ---------- daily chart ----------
function DailyChart({ rows, from, to, totalCents }: { rows: Daily[]; from: string; to: string; totalCents: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const days = useMemo(() => {
    const byDay = new Map(rows.map((r) => [r.day, r]));
    const out: Daily[] = [];
    for (let d = from, guard = 0; d <= to && guard < 400; d = addDays(d, 1), guard++) {
      out.push(
        byDay.get(d) ?? { day: d, orders: 0, grossCents: 0, netCents: 0, partnerShareCents: 0, operatorShareCents: 0 },
      );
    }
    return out;
  }, [rows, from, to]);

  const maxCents = Math.max(0, ...days.map((d) => d.netCents));
  const step = niceStep(Math.max(maxCents / 100, 1) / 4);
  const top = Math.max(step, Math.ceil(maxCents / 100 / step) * step) * 100; // santim
  const ticks: number[] = [];
  for (let t = 0; t <= top + 1; t += step * 100) ticks.push(t);
  const n = days.length;
  const labelEvery = Math.max(1, Math.ceil(n / 7));
  const peak = days.reduce((best, d, i) => (d.netCents > (days[best]?.netCents ?? -1) ? i : best), 0);
  const h = (cents: number) => `${(cents / top) * 100}%`;
  const hovered = hover !== null ? days[hover] : null;

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">Net revenue</h3>
          <p className="mt-1 text-2xl font-bold tracking-tight text-brand-700">{etb(totalCents)}</p>
          <div className="mt-2">
            <Legend items={SHARE_LEGEND} />
          </div>
        </div>
        <button
          className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
          onClick={() => setShowTable((v) => !v)}
          aria-pressed={showTable}
        >
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </div>

      {showTable ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-1">Day</th>
                <th>Orders</th>
                <th className="text-right">Gross</th>
                <th className="text-right">Net</th>
                <th className="text-right">LEMAT 70%</th>
                <th className="text-right">Ethio Telecom 30%</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-2 text-slate-400">No sales in this period</td>
                </tr>
              )}
              {rows.map((d) => (
                <tr key={d.day} className="border-t border-slate-100">
                  <td className="py-2">{longDay(d.day)}</td>
                  <td>{d.orders}</td>
                  <td className="text-right">{etb(d.grossCents)}</td>
                  <td className="text-right">{etb(d.netCents)}</td>
                  <td className="text-right">{etb(d.partnerShareCents)}</td>
                  <td className="text-right">{etb(d.operatorShareCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : maxCents === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 py-16 text-center text-sm text-slate-500">No sales in this period</p>
      ) : (
        <div className="mt-5 flex">
          <div className="relative h-[240px] w-12 shrink-0 text-right text-[11px] tabular-nums" style={{ color: C.muted }}>
            {ticks.map((t) => (
              <span key={t} className="absolute right-2 translate-y-1/2" style={{ bottom: h(t) }}>
                {(t / 100).toLocaleString()}
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="relative h-[240px]">
              {ticks.map((t) => (
                <span
                  key={t}
                  className="absolute inset-x-0 h-px"
                  style={{ bottom: h(t), background: t === 0 ? C.baseline : C.grid }}
                  aria-hidden
                />
              ))}
              <div className="absolute inset-0 flex items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
                {days.map((d, i) => (
                  <button
                    key={d.day}
                    type="button"
                    className={`relative flex h-full min-w-0 flex-1 items-end justify-center rounded-md outline-none ${
                      hover === i ? 'bg-slate-100/80' : ''
                    } focus-visible:ring-2 focus-visible:ring-brand-500`}
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    aria-label={`${longDay(d.day)}: net ${etb(d.netCents)}, LEMAT ${etb(d.partnerShareCents)}, Ethio Telecom ${etb(d.operatorShareCents)}, ${d.orders} orders`}
                  >
                    {d.netCents > 0 && (
                      <span
                        className="flex w-full max-w-6 flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px]"
                        style={{ height: h(d.netCents), minHeight: 3 }}
                      >
                        <span style={{ flex: `${d.partnerShareCents} 1 0`, background: C.lemat }} />
                        <span style={{ flex: `${d.operatorShareCents} 1 0`, background: C.telecom }} />
                      </span>
                    )}
                    {i === peak && hover === null && (
                      <span
                        className="pointer-events-none absolute whitespace-nowrap text-[11px] font-semibold tabular-nums text-slate-700"
                        style={{ bottom: `calc(${h(d.netCents)} + 4px)` }}
                      >
                        {amount(d.netCents)}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {hovered && hover !== null && (
                <div
                  role="tooltip"
                  className="pointer-events-none absolute top-0 z-10 w-52 rounded-xl bg-white p-3 text-xs shadow-lg ring-1 ring-black/10"
                  style={{
                    left: `${((hover + 0.5) / n) * 100}%`,
                    transform: `translateX(${hover < n / 4 ? '8px' : hover > (3 * n) / 4 ? 'calc(-100% - 8px)' : '-50%'})`,
                  }}
                >
                  <p className="text-slate-500">{longDay(hovered.day)}</p>
                  <p className="mt-0.5 text-base font-semibold text-slate-900">{etb(hovered.netCents)}</p>
                  <p className="text-slate-500">net revenue</p>
                  <div className="mt-2 space-y-1 tabular-nums">
                    {[
                      { label: 'LEMAT', cents: hovered.partnerShareCents, color: C.lemat },
                      { label: 'Ethio Telecom', cents: hovered.operatorShareCents, color: C.telecom },
                    ].map((row) => (
                      <p key={row.label} className="flex items-center gap-2">
                        <span className="h-0.5 w-3 rounded-full" style={{ background: row.color }} aria-hidden />
                        <span className="font-semibold text-slate-900">{etb(row.cents)}</span>
                        <span className="text-slate-500">{row.label}</span>
                      </p>
                    ))}
                  </div>
                  <p className="mt-2 border-t border-slate-100 pt-2 text-slate-500">
                    {hovered.orders} order{hovered.orders === 1 ? '' : 's'} · {etb(hovered.grossCents)} gross
                  </p>
                </div>
              )}
            </div>
            <div className="relative h-6 text-[11px]" style={{ color: C.muted }}>
              {days.map((d, i) =>
                // regular labels, plus the last day when it isn't too close to the previous label
                i % labelEvery === 0 || (i === n - 1 && i % labelEvery >= labelEvery * 0.6) ? (
                  <span
                    key={d.day}
                    className="absolute top-1.5 -translate-x-1/2 whitespace-nowrap"
                    style={{ left: `${((i + 0.5) / n) * 100}%` }}
                  >
                    {shortDay(d.day)}
                  </span>
                ) : null,
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------- subscription mix ----------
function SubscriptionMix({ s }: { s: Summary }) {
  const rows = PLAN_ORDER.map((type) => {
    const p = s.byPlan.find((x) => x.planType === type);
    return {
      type,
      orders: p?.orders ?? 0,
      netCents: p?.netCents ?? 0,
      priceCents: p && p.orders > 0 ? Math.round(p.grossCents / p.orders) : null,
    };
  });
  const total = rows.reduce((sum, r) => sum + r.orders, 0);
  return (
    <section className="card p-5">
      <CardHeader title="Subscription mix" sub="Paid orders by plan in this period" />
      {total === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 py-10 text-center text-sm text-slate-500">No sales in this period</p>
      ) : (
        <>
          <div className="mt-4">
            <SplitBar parts={rows.map((r) => ({ key: r.type, cents: r.orders, color: PLAN_COLOR[r.type] }))} />
          </div>
          <ul className="mt-4 space-y-2">
            {rows.map((r) => (
              <li key={r.type} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PLAN_COLOR[r.type] }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900">{PLAN_LABEL[r.type]}</span>
                  <span className="block text-xs text-slate-500">
                    {r.priceCents !== null ? `${amount(r.priceCents).replace('.00', '')} ETB / ${PLAN_UNIT[r.type]}` : 'no sales'}
                    {r.netCents > 0 ? ` · net ${etb(r.netCents)}` : ''}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-bold tabular-nums text-slate-900">{r.orders.toLocaleString()}</span>
                  <span className="block text-xs tabular-nums text-slate-500">{pctOf(r.orders, total)}%</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// ---------- revenue sharing ----------
function SharingCard({ s }: { s: Summary }) {
  const r = s.revenue;
  const rows = [
    { key: 'vat', label: 'VAT (15%)', note: 'paid to the government', cents: r.vatCents, color: C.vat },
    ...(r.otherTaxCents > 0
      ? [{ key: 'tax', label: 'Other statutory taxes', note: 'paid to the government', cents: r.otherTaxCents, color: C.otherTax }]
      : []),
    { key: 'lemat', label: 'LEMAT TECHNOLOGY PLC', note: '70% of net revenue', cents: r.partnerShareCents, color: C.lemat },
    { key: 'et', label: 'Ethio Telecom', note: '30% of net revenue', cents: r.operatorShareCents, color: C.telecom },
  ];
  return (
    <section className="card p-5">
      <CardHeader title="Where each birr goes" sub="Revenue sharing · proposal section 3.2" />
      <div className="mt-4">
        <SplitBar parts={rows} height="h-4" />
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
            <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: row.color }} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-800">{row.label}</span>
              <span className="block text-xs text-slate-500">{row.note}</span>
            </span>
            <span className="text-right">
              <span className="block text-sm font-bold tabular-nums text-slate-900">{etb(row.cents)}</span>
              <span className="block text-xs tabular-nums text-slate-500">{pctOf(row.cents, r.grossCents)}% of gross</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-slate-500">
        Gross {etb(r.grossCents)} − VAT and taxes = net {etb(r.netCents)}, shared 70 / 30.
      </p>
    </section>
  );
}

// ---------- activity ----------
function ActivityCard({
  s,
  prev,
  onNavigate,
}: {
  s: Summary;
  prev: Summary | null;
  onNavigate?: (t: NavTarget) => void;
}) {
  const demo = change(s.plays.demo, prev?.plays.demo, null);
  const rows: { icon: LucideIcon; label: string; value: string; note: string; action?: { label: string; to: NavTarget } }[] = [
    { icon: Users, label: 'Customers', value: s.users.toLocaleString(), note: 'all time' },
    {
      icon: Gamepad2,
      label: 'Free demo plays',
      value: s.plays.demo.toLocaleString(),
      note: !demo ? 'this period' : demo.text === 'New' ? 'none in the previous period' : `${demo.text} vs previous period`,
    },
    {
      icon: LifeBuoy,
      label: 'Open support tickets',
      value: s.openTickets.toLocaleString(),
      note: s.openTickets > 0 ? 'waiting for a reply' : 'all answered',
      action: s.openTickets > 0 ? { label: 'Reply', to: 'Support' } : undefined,
    },
  ];
  return (
    <section className="card p-5">
      <CardHeader title="Activity" sub="Customers and support" />
      <ul className="mt-4 space-y-2">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-600 ring-1 ring-slate-200">
              <r.icon className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900">{r.label}</span>
              <span className={`block text-xs ${r.action ? 'font-medium text-amber-700' : 'text-slate-500'}`}>{r.note}</span>
            </span>
            <span className="text-lg font-bold tabular-nums text-slate-900">{r.value}</span>
            {r.action && onNavigate && (
              <button
                onClick={() => onNavigate(r.action!.to)}
                className="flex items-center text-xs font-semibold text-brand-600 hover:underline"
              >
                {r.action.label}
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- by game ----------
function ByGame({ s }: { s: Summary }) {
  const rows = s.byGame;
  const max = Math.max(1, ...rows.map((r) => r.netCents));
  return (
    <section className="card p-5">
      <CardHeader title="Top games" sub="Net revenue, highest first" right={<Legend items={SHARE_LEGEND} />} />
      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 py-10 text-center text-sm text-slate-500">No sales in this period</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {rows.map((r) => (
            <li
              key={r.gameId}
              tabIndex={0}
              className="group flex items-center gap-3 rounded-lg py-3 outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {r.slug && (
                <GameArt slug={r.slug} image={r.imageUrl} color="#64748b" title={r.title} className="h-11 w-11 shrink-0 rounded-xl" sizes="44px" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-semibold text-slate-800">{r.title}</span>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-slate-900">{etb(r.netCents)}</span>
                </div>
                <div className="mt-1.5" style={{ width: `${Math.max(2, (r.netCents / max) * 100)}%` }}>
                  <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-r-[4px]" aria-hidden>
                    <span style={{ flex: `${r.partnerShareCents} 1 0`, background: C.lemat }} />
                    <span style={{ flex: `${r.operatorShareCents} 1 0`, background: C.telecom }} />
                  </div>
                </div>
                <p className="mt-1 text-xs tabular-nums text-slate-500">
                  <span className="group-hover:hidden group-focus:hidden">
                    {r.orders} order{r.orders === 1 ? '' : 's'} · {etb(r.grossCents)} gross
                  </span>
                  <span className="hidden group-hover:inline group-focus:inline">
                    LEMAT {etb(r.partnerShareCents)} · Ethio Telecom {etb(r.operatorShareCents)}
                  </span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- conversions ----------
const CONVERSION_STATUS: Record<
  Summary['redemptions'][number]['status'],
  { label: string; icon: LucideIcon; color: string; note: string }
> = {
  PENDING: { label: 'Waiting for payout', icon: Clock3, color: C.warning, note: 'to send as e-money' },
  PAID: { label: 'Paid to telebirr', icon: CheckCircle2, color: C.good, note: 'sent to customers' },
  REJECTED: { label: 'Rejected', icon: XCircle, color: C.critical, note: 'coins returned' },
};
function ConversionsCard({ s, onNavigate }: { s: Summary; onNavigate?: (t: NavTarget) => void }) {
  const pending = s.redemptions.find((r) => r.status === 'PENDING')?.count ?? 0;
  return (
    <section className="card p-5">
      <CardHeader
        title="Coin conversions"
        sub="Coins changed to ETB e-money in this period"
        right={
          onNavigate && (
            <button
              onClick={() => onNavigate('Coin conversions')}
              className="flex items-center text-xs font-semibold text-brand-600 hover:underline"
            >
              {pending > 0 ? `Review ${pending} waiting` : 'View all'}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          )
        }
      />
      <ul className="mt-4 space-y-2">
        {s.redemptions.map((r) => {
          const st = CONVERSION_STATUS[r.status];
          return (
            <li key={r.status} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
              <st.icon className="h-5 w-5 shrink-0" style={{ color: st.color }} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">{st.label}</span>
                <span className="block text-xs text-slate-500">
                  {r.count} request{r.count === 1 ? '' : 's'} · {r.coins.toLocaleString()} coins · {st.note}
                </span>
              </span>
              <span className="text-sm font-bold tabular-nums text-slate-900">{etb(r.amountCents)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------- the tab ----------
export function RevenueTab({ onAuthError, onNavigate }: TabProps & { onNavigate?: (t: NavTarget) => void }) {
  const [preset, setPreset] = useState<Preset>('30');
  const [range, setRange] = useState(() => presetRange('30'));
  const { from, to } = range;
  const days = dayCount(from, to);
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));

  const qs = `from=${from}&to=${to}`;
  const summary = useLoad<Summary>(`/admin/summary?${qs}`, onAuthError);
  const previous = useLoad<Summary>(`/admin/summary?from=${prevFrom}&to=${prevTo}`, onAuthError);
  const daily = useLoad<Daily[]>(`/admin/revenue/daily?${qs}`, onAuthError);
  const settings = useLoad<CoinSettings>('/admin/settings/coins', onAuthError);
  const [downloading, setDownloading] = useState(false);

  const choose = (p: Exclude<Preset, 'custom'>) => {
    setPreset(p);
    setRange(presetRange(p));
  };
  const setCustom = (next: Partial<typeof range>) => {
    const r = { ...range, ...next };
    if (r.from && r.to && r.from <= r.to) {
      setPreset('custom');
      setRange(r);
    }
  };

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
  const p = previous.data;
  const reloading = summary.loading || daily.loading;
  const vsLabel = `vs previous ${days} day${days === 1 ? '' : 's'}`;
  const coinsWorth = settings.data && s ? etb(Math.floor((s.coinsIssued * 100) / settings.data.coinsPerEtb)) : null;

  return (
    <div className="space-y-6">
      {/* one filter row scopes everything below */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/5" role="group" aria-label="Date range">
          {PRESETS.map((o) => (
            <button
              key={o.id}
              onClick={() => choose(o.id)}
              aria-pressed={preset === o.id}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                preset === o.id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="date"
            aria-label="From"
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
            value={from}
            max={to}
            onChange={(e) => setCustom({ from: e.target.value })}
          />
          <span aria-hidden>–</span>
          <input
            type="date"
            aria-label="To"
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
            value={to}
            min={from}
            onChange={(e) => setCustom({ to: e.target.value })}
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            onClick={() => {
              summary.load();
              previous.load();
              daily.load();
            }}
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${reloading ? 'animate-spin' : ''}`} aria-hidden />
          </button>
          <button className="btn-primary py-2" onClick={downloadCsv} disabled={downloading}>
            <Download className="h-4 w-4" aria-hidden /> {downloading ? 'Preparing…' : 'Reconciliation CSV'}
          </button>
        </div>
      </div>

      {summary.error && <ErrorNote message={summary.error} />}
      {!s && !summary.error && <Spinner />}
      {s && (
        <div className={`space-y-6 transition-opacity ${reloading ? 'opacity-60' : ''}`}>
          {/* KPI cards */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              corner="leaf"
              label="Gross revenue"
              value={amount(s.revenue.grossCents)}
              unit="ETB"
              chip={change(s.revenue.grossCents, p?.revenue.grossCents)}
              note={`${s.revenue.paidOrders} paid orders · ${vsLabel}`}
            />
            <KpiCard
              corner="blue"
              label="Active subscriptions"
              value={s.activeSubscriptions.toLocaleString()}
              chip={{ text: 'Now', tone: 'neutral' }}
              note={`Across ${s.users.toLocaleString()} customer${s.users === 1 ? '' : 's'}`}
            />
            <KpiCard
              corner="violet"
              label="Paid plays"
              value={s.plays.full.toLocaleString()}
              chip={change(s.plays.full, p?.plays.full)}
              note={`+ ${s.plays.demo.toLocaleString()} free demo plays`}
            />
            <KpiCard
              corner="amber"
              label="Coins issued"
              value={compact(s.coinsIssued)}
              chip={coinsWorth ? { text: `= ${coinsWorth}`, tone: 'info' } : null}
              note="Earned by customers this period"
            />
          </section>

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <DailyChart rows={daily.data ?? []} from={from} to={to} totalCents={s.revenue.netCents} />
            <SubscriptionMix s={s} />
          </div>

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <SharingCard s={s} />
            <ActivityCard s={s} prev={p} onNavigate={onNavigate} />
          </div>

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <ByGame s={s} />
            <ConversionsCard s={s} onNavigate={onNavigate} />
          </div>
        </div>
      )}
    </div>
  );
}
