import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';

/** Sends guests to /login and brings them back to the current page afterwards. */
export function useRequireAuth() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  useEffect(() => {
    if (auth.ready && !auth.user) {
      navigate(`/login?next=${encodeURIComponent(search ? `${pathname}${search}` : pathname)}`, { replace: true });
    }
  }, [auth.ready, auth.user, pathname, search, navigate]);

  return auth;
}
