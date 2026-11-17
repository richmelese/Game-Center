import { API_URL, IS_WEB } from './config';

export { API_URL };

/*
 * Mini-app session. On the web the session is an httpOnly cookie. Inside the telebirr
 * SuperApp the web view drops cross-site cookies, so the backend also returns the JWT and
 * the mini-app sends it as `Authorization: Bearer`. It lives in memory plus sessionStorage
 * (cleared when the mini-app closes) and is only ever kept inside the mini-app.
 */
const TOKEN_KEY = 'telegame_token';
let authToken: string | null = null;
if (!IS_WEB) {
  try {
    authToken = sessionStorage.getItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function setAuthToken(token: string | null | undefined) {
  if (IS_WEB) return;
  authToken = token || null;
  try {
    if (authToken) sessionStorage.setItem(TOKEN_KEY, authToken);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Request options that carry the session: the cookie on the web, the bearer token in the mini-app. */
export function authInit(json: boolean): Pick<RequestInit, 'credentials' | 'headers'> {
  const headers: Record<string, string> = json ? { 'Content-Type': 'application/json' } : {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  return { credentials: IS_WEB ? 'include' : 'omit', headers };
}

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Options = { method?: string; body?: unknown; raw?: boolean };

// On the web the session lives in an httpOnly cookie the backend sets on login (see POST
// /auth/* and /auth/logout) — never in localStorage, which any injected script could read.
// `credentials: 'include'` is what makes the browser attach it cross-origin.
export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? (opts.body ? 'POST' : 'GET'),
      ...authInit(!!opts.body),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the Game Center. Check your connection and try again.', 0);
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      message = Array.isArray(data.message) ? data.message.join(', ') : (data.message ?? message);
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(message, res.status);
  }
  if (opts.raw) return (await res.blob()) as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}
