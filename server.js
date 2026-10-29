// Production static file server for the built SPA (npm run build && npm run serve).
// Vite only builds static files — it has no request-time header hook like next.config.ts's
// headers() did, so the same security headers are applied here instead, at serve time.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const PORT = Number(process.env.PORT) || 3000;
const isDev = process.env.NODE_ENV !== 'production';

const apiOrigin = new URL(process.env.VITE_API_URL ?? 'http://localhost:4000/api').origin;
const gamesOrigin = new URL(process.env.VITE_GAMES_BASE_URL ?? 'http://localhost:8642').origin;

/**
 * Content-Security-Policy: scripts and styles only from this site, API calls only to the
 * teleGame API, game frames and pictures only from the game suppliers, and the site itself
 * cannot be framed by other sites (clickjacking).
 */
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // Tailwind-generated inline styles (transform/background etc.)
  `img-src 'self' data: blob: ${gamesOrigin}`,
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin}`,
  `frame-src https://muen-web.tmofamily.com ${gamesOrigin}`,
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': csp,
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  // only takes effect when served over HTTPS
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value);

  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const safePath = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(DIST, safePath);

  try {
    let body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    // client-side routing: unknown paths fall back to index.html
    try {
      const body = await readFile(join(DIST, 'index.html'));
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  }
}).listen(PORT, () => {
  console.log(`Game Center serving dist/ on http://localhost:${PORT}${isDev ? ' (NODE_ENV is not production)' : ''}`);
});
