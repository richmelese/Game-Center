'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from './auth';

/** Sends guests to /login and brings them back to the current page afterwards. */
export function useRequireAuth() {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    if (auth.ready && !auth.user) {
      const qs = search.toString();
      router.replace(`/login?next=${encodeURIComponent(qs ? `${pathname}?${qs}` : pathname)}`);
    }
  }, [auth.ready, auth.user, pathname, search, router]);

  return auth;
}
