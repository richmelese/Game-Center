export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

const TOKEN_KEY = 'telegame.token';
const ADMIN_TOKEN_KEY = 'telegame.adminToken';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable (private mode) - session lasts for this page only */
  }
}

export const tokens = {
  customer: () => read(TOKEN_KEY),
  setCustomer: (t: string | null) => write(TOKEN_KEY, t),
  admin: () => read(ADMIN_TOKEN_KEY),
  setAdmin: (t: string | null) => write(ADMIN_TOKEN_KEY, t),
};

type Options = { method?: string; body?: unknown; admin?: boolean; raw?: boolean };

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const token = opts.admin ? tokens.admin() : tokens.customer();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? (opts.body ? 'POST' : 'GET'),
      headers: {
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
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
