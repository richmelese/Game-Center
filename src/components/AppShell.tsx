import { Coins, Gamepad2, LifeBuoy, Ticket, Wallet } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';

const NAV = [
  { href: '/', label: 'Games', icon: Gamepad2 },
  { href: '/my-games', label: 'My games', icon: Ticket },
  { href: '/wallet', label: 'Wallet', icon: Wallet },
  { href: '/support', label: 'Help', icon: LifeBuoy },
];

/**
 * Mobile frame for every customer page. Styled like the telebirr SuperApp
 * (green header and bottom bar) because the Game Center runs inside it as a mini app.
 */
export function AppShell({ children, title }: { children: React.ReactNode; title?: string }) {
  const { user } = useAuth();
  const { pathname } = useLocation();

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-[#f2f2f2]">
      <header className="telebirr-waves sticky top-0 z-20 flex items-center gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white shadow-sm">
        <Link to="/" className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-leaf-600 shadow-sm">
            <Gamepad2 className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-lg font-semibold">{title ?? 'Game Center'}</span>
            <span className="block text-[11px] text-white/85">by LEMAT · on telebirr</span>
          </span>
        </Link>
        <div className="ml-auto shrink-0">
          {user ? (
            <Link
              to="/wallet"
              className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-sm font-semibold text-white ring-1 ring-white/50"
            >
              <Coins className="h-4 w-4 text-sun" aria-hidden />
              {user.coinBalance.toLocaleString()}
              <span className="sr-only">coins</span>
            </Link>
          ) : (
            <Link
              to={`/login?next=${encodeURIComponent(pathname)}`}
              className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-leaf-700 shadow-sm"
            >
              Log in
            </Link>
          )}
        </div>
      </header>

      <main className="flex-1 px-4 pb-28 pt-4">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md bg-leaf-500 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_8px_rgb(0_0_0/0.08)]">
        <ul className="grid grid-cols-4">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' || pathname.startsWith('/games') : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  to={href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex flex-col items-center gap-0.5 pb-2.5 pt-3 text-xs ${
                    active ? 'font-semibold text-white' : 'text-white/75'
                  }`}
                >
                  {active && <span className="absolute top-1 h-1.5 w-1.5 rounded-full bg-white" aria-hidden />}
                  <Icon className="h-6 w-6" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-leaf-400/40 border-t-leaf-600" />
      {label}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
      {message}
    </p>
  );
}
