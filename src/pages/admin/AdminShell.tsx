import { Bell, ExternalLink, Gamepad2, LogOut, Search, type LucideIcon } from 'lucide-react';
import { PLAN_LABEL, timeRateText } from '@/lib/format';
import type { PlanType } from '@/lib/types';

export interface NavItem<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
  meta?: string;
  badge?: number;
}

export interface SidebarPricing {
  plans: { type: PlanType; label: string }[];
  coinsPerEtb?: number;
  timeRate?: { coins: number; minutes: number };
}

/** "LEMAT Admin" -> "LA", "admin@lemattech.com" -> "A" */
const initials = (s: string) =>
  s
    .split('@')[0]
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || 'A';

const todayLabel = () =>
  new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Addis_Ababa',
  });

/**
 * Admin layout: sidebar (brand, menu with badges, pricing summary) on large screens,
 * a compact header with scrolling tabs on phones, and a top bar with title, search,
 * notifications and the main action.
 */
export function AdminShell<T extends string>({
  items,
  active,
  onSelect,
  pricing,
  onEditPrices,
  search,
  onSearch,
  alerts,
  onAlerts,
  onSignOut,
  profile,
  children,
}: {
  profile?: { name: string | null; email: string | null } | null;
  items: NavItem<T>[];
  active: T;
  onSelect: (id: T) => void;
  pricing: SidebarPricing | null;
  onEditPrices: () => void;
  search: string;
  onSearch: (q: string) => void;
  alerts: number;
  onAlerts: () => void;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  const current = items.find((i) => i.id === active);

  const brand = (
    <div className="flex items-center gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-leaf-700 shadow-lg shadow-black/20 ring-1 ring-white/40">
        <Gamepad2 className="h-6 w-6" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block text-base font-bold text-white">Game Center</span>
        <span className="block text-xs text-white/90">LEMAT Technology · Admin</span>
      </span>
    </div>
  );

  const bell = (onDark: boolean) => (
    <button
      onClick={onAlerts}
      className={`relative flex h-10 w-10 items-center justify-center rounded-xl transition ${
        onDark
          ? 'bg-white/20 text-white ring-1 ring-white/40 hover:bg-white/30'
          : 'bg-white text-slate-600 shadow-sm ring-1 ring-black/5 hover:bg-slate-50'
      }`}
      aria-label={alerts > 0 ? `${alerts} item${alerts === 1 ? '' : 's'} need attention` : 'Nothing needs attention'}
      title={alerts > 0 ? `${alerts} need attention` : 'All caught up'}
    >
      <Bell className="h-5 w-5" aria-hidden />
      {alerts > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
          {alerts > 99 ? '99+' : alerts}
        </span>
      )}
    </button>
  );

  const badge = (n: number) => (
    <span className="rounded-full bg-sun px-2 py-0.5 text-[11px] font-bold text-slate-900 shadow-sm">{n}</span>
  );

  return (
    <div className="admin-backdrop min-h-dvh lg:flex">
      {/* sidebar (large screens) */}
      <aside className="admin-sidebar sticky top-0 hidden h-dvh w-[17rem] shrink-0 flex-col overflow-hidden px-4 py-5 text-white shadow-xl shadow-leaf-900/20 lg:flex">
        {/* soft glow (decoration) */}
        <span
          className="pointer-events-none absolute -right-20 -top-16 h-56 w-56 rounded-full bg-white/20 blur-3xl"
          aria-hidden
        />
        <span
          className="pointer-events-none absolute -bottom-24 -left-20 h-64 w-64 rounded-full bg-sun/15 blur-3xl"
          aria-hidden
        />

        <div className="relative px-1">{brand}</div>

        <div className="relative -mx-2 min-h-0 flex-1 overflow-y-auto px-2 pb-1 [scrollbar-width:thin]">
          <p className="relative mb-1.5 mt-6 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">
            Manage
          </p>
          <nav className="relative space-y-1" aria-label="Admin sections">
            {items.map((i) => {
              const on = i.id === active;
              return (
                <button
                  key={i.id}
                  onClick={() => onSelect(i.id)}
                  aria-current={on ? 'page' : undefined}
                  className={`group flex w-full items-center gap-3 rounded-xl px-3 py-1.5 text-left text-sm font-medium transition ${
                    on
                      ? 'bg-white text-leaf-800 shadow-lg shadow-black/15'
                      : 'text-white hover:bg-white/15 hover:text-white'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition ${
                      on ? 'bg-leaf-700 text-white' : 'bg-white/20 text-white group-hover:bg-white/30'
                    }`}
                  >
                    <i.icon className="h-[17px] w-[17px]" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{i.label}</span>
                  {i.badge ? (
                    badge(i.badge)
                  ) : i.meta ? (
                    <span className={`text-xs tabular-nums ${on ? 'text-leaf-700/70' : 'text-white/80'}`}>
                      {i.meta}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          <p className="relative mb-1.5 mt-5 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">
            Pricing
          </p>
          <div className="relative rounded-2xl bg-white/20 px-3.5 py-3 text-sm ring-1 ring-white/40 backdrop-blur">
            {pricing ? (
              <>
                <dl className="space-y-1">
                  {pricing.plans.map((p) => (
                    <div key={p.type} className="flex justify-between">
                      <dt className="font-medium text-white/90">{PLAN_LABEL[p.type]}</dt>
                      <dd className="font-semibold tabular-nums text-white">{p.label}</dd>
                    </div>
                  ))}
                </dl>
                {(pricing.coinsPerEtb || pricing.timeRate) && (
                  <dl className="mt-2 space-y-1 border-t border-white/30 pt-2">
                    {pricing.coinsPerEtb && (
                      <div className="flex justify-between">
                        <dt className="font-medium text-white/90">Coin rate</dt>
                        <dd className="font-semibold tabular-nums text-white">{pricing.coinsPerEtb} = 1 ETB</dd>
                      </div>
                    )}
                    {pricing.timeRate && (
                      <div className="flex justify-between gap-2">
                        <dt className="font-medium text-white/90">Play rate</dt>
                        <dd className="text-right font-semibold text-white">{timeRateText(pricing.timeRate)}</dd>
                      </div>
                    )}
                  </dl>
                )}
                <button
                  onClick={onEditPrices}
                  className="mt-3 w-full rounded-lg bg-white py-1.5 text-xs font-semibold text-leaf-800 shadow-sm transition hover:bg-white/85"
                >
                  Edit prices
                </button>
              </>
            ) : (
              <p className="text-xs text-white/85">Loading…</p>
            )}
          </div>
        </div>

        {/* profile + sign out (always visible) */}
        <div className="relative mt-3 flex shrink-0 items-center gap-3 rounded-2xl bg-white/20 p-3 ring-1 ring-white/40">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-leaf-800 shadow">
            {initials(profile?.name ?? profile?.email ?? 'A')}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-semibold text-white">{profile?.name ?? 'Admin'}</span>
            <span className="block truncate text-xs text-white/90">{profile?.email ?? ''}</span>
          </span>
          <button
            onClick={onSignOut}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/25 text-white ring-1 ring-white/40 transition hover:bg-white/40"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-[17px] w-[17px]" aria-hidden />
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* compact header (phones / tablets) */}
        <header className="admin-sidebar sticky top-0 z-20 text-white shadow-lg shadow-leaf-900/20 lg:hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            {brand}
            <div className="ml-auto flex items-center gap-2">
              {bell(true)}
              <button
                onClick={onSignOut}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-white ring-1 ring-white/40"
                aria-label="Sign out"
              >
                <LogOut className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-3" aria-label="Admin sections">
            {items.map((i) => {
              const on = i.id === active;
              return (
                <button
                  key={i.id}
                  onClick={() => onSelect(i.id)}
                  aria-current={on ? 'page' : undefined}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
                    on ? 'bg-white text-leaf-800 shadow' : 'text-white'
                  }`}
                >
                  <i.icon className="h-4 w-4" aria-hidden />
                  {i.label}
                  {i.badge ? badge(i.badge) : null}
                </button>
              );
            })}
          </nav>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8 [&_.card]:shadow-[0_1px_2px_rgb(16_24_40/0.04),0_14px_34px_-18px_rgb(16_24_40/0.22)] [&_.card]:ring-black/[0.04]">
          {/* top bar */}
          <div className="mb-7 flex flex-wrap items-center gap-4">
            <div className="min-w-0">
              <h1 className="bg-gradient-to-r from-slate-900 via-slate-800 to-leaf-700 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent lg:text-[2rem]">
                {current?.label}
              </h1>
              <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                <span className="h-2 w-2 rounded-full bg-leaf-500 ring-4 ring-leaf-500/15" aria-hidden />
                {todayLabel()} · telebirr SuperApp Game Center
              </p>
            </div>
            <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
              <label className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
                <span className="sr-only">Search games</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => onSearch(e.target.value)}
                  placeholder="Search games…"
                  className="h-10 w-full rounded-xl bg-white pl-9 pr-3 text-sm shadow-sm outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-brand-300"
                />
              </label>
              <span className="hidden lg:block">{bell(false)}</span>
              <a
                href="/"
                target="_blank"
                rel="noreferrer"
                className="btn h-10 shrink-0 whitespace-nowrap rounded-xl bg-gradient-to-r from-leaf-600 to-leaf-700 px-4 py-0 text-white shadow-md shadow-leaf-700/25 hover:from-leaf-700 hover:to-leaf-800"
              >
                <ExternalLink className="h-4 w-4" aria-hidden /> Open Game Center
              </a>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
