import type { NextConfig } from 'next';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
const apiOrigin = new URL(API_URL).origin;
// the hosted HTML5 games (Ethio Telecom Games Portal): game frames and cover pictures come from here
const GAMES_BASE_URL = process.env.NEXT_PUBLIC_GAMES_BASE_URL ?? 'http://localhost:8642';
const gamesOrigin = new URL(GAMES_BASE_URL).origin;
const isDev = process.env.NODE_ENV !== 'production';

/**
 * Content-Security-Policy: scripts and styles only from this site, API calls only to the
 * teleGame API, game frames and pictures only from the game suppliers, and the site itself cannot be
 * framed by other sites (clickjacking). Next.js needs inline scripts/styles; dev mode also
 * needs eval for hot reload.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${gamesOrigin}`,
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin}${isDev ? ' ws:' : ''}`,
  `frame-src https://muen-web.tmofamily.com ${gamesOrigin}`,
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          // only takes effect when served over HTTPS
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;
