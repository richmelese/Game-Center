/**
 * Central runtime config. Values come from Vite env vars when present; otherwise fall back to
 * these constants so nothing is ever `undefined` (e.g. builds where .env isn't loaded).
 */
const DEFAULTS = {
  API_URL: 'https://game.goffice.et/api',
  GAMES_BASE_URL: 'https://games.goffice.et',
  TELEBIRR_MINIAPP_ID: '79871c3e11f6328983e21a1f049ba2d2',
} as const;

const env = (value: string | undefined, fallback: string) => (value && value.trim()) || fallback;

export const API_URL = env(import.meta.env.VITE_API_URL, DEFAULTS.API_URL);
export const GAMES_BASE_URL = env(import.meta.env.VITE_GAMES_BASE_URL, DEFAULTS.GAMES_BASE_URL);
export const TELEBIRR_MINIAPP_ID = env(import.meta.env.VITE_TELEBIRR_MINIAPP_ID, DEFAULTS.TELEBIRR_MINIAPP_ID);

/** True when served over http(s) (web / server.js); false inside the SuperApp's local package. */
export const IS_WEB = typeof location !== 'undefined' && /^https?:$/.test(location.protocol);

/** URL of a file in /public that works both on the web and from the local mini-app package. */
export const assetUrl = (path: string) => `${IS_WEB ? '/' : './'}${path.replace(/^\/+/, '')}`;
