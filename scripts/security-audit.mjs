// Security audit: attacks the running API and website the way a penetration tester would,
// and fails loudly on any weakness. Development / test environments only — it creates test
// customers, a few orders and a support ticket, and edits rows in the local Docker database.
//
//   node scripts/security-audit.mjs      (API on :4000, website on :3000, backend/.env present)
//
import { execSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const API = 'http://localhost:4000/api';
const WEB = 'http://localhost:3000';
const env = Object.fromEntries(
  readFileSync(new URL('../backend/.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const sql = (q) =>
  execSync(`docker exec telegame-postgres psql -U telegame -d telegame -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();

let failures = 0;
let passes = 0;
const check = (cond, msg, detail = '') => {
  if (cond) {
    passes++;
    console.log('  ✓', msg);
  } else {
    failures++;
    console.log('  ✗ FAIL:', msg, detail);
  }
};
async function req(method, path, { token, body, raw, headers = {}, base = API } = {}) {
  const payload = raw ?? (body !== undefined ? JSON.stringify(body) : undefined);
  const res = await fetch(base + path, {
    method,
    redirect: 'manual',
    headers: {
      ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: payload,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, headers: res.headers, text, json };
}

// ---- JWT helpers (to forge tokens the way an attacker would)
const b64u = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const signJwt = (payload, secret, header = { alg: 'HS256', typ: 'JWT' }) => {
  const head = `${b64u(header)}.${b64u(payload)}`;
  return `${head}.${createHmac('sha256', secret).update(head).digest('base64url')}`;
};
const now = () => Math.floor(Date.now() / 1000);

// ---- helpers to create test customers
const randPhone = () => '09' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
async function customer() {
  const phone = randPhone();
  const r = await req('POST', '/auth/otp/request', { body: { phone } });
  if (!r.json?.devCode) throw new Error(`OTP request failed (${r.status}): ${r.text} — is OTP_DEV_ECHO=true?`);
  const v = await req('POST', '/auth/otp/verify', { body: { phone, code: r.json.devCode } });
  return { phone, token: v.json.accessToken, id: v.json.user.id };
}

// =====================================================================
const ROUTES = [
  ['GET', '/health'],
  ['POST', '/auth/otp/request'], ['POST', '/auth/otp/verify'], ['POST', '/auth/telebirr'], ['POST', '/auth/admin/login'],
  ['GET', '/auth/me'],
  ['GET', '/games'], ['GET', '/games/candy-match-3'], ['GET', '/me/subscriptions'],
  ['POST', '/payments/checkout'], ['POST', '/payments/telebirr/notify'], ['POST', '/payments/mock/complete'],
  ['GET', '/payments/orders'], ['GET', '/payments/orders/X'], ['GET', '/payments/orders/X/checkout-info'],
  ['POST', '/play/start'], ['POST', '/play/X/heartbeat'], ['POST', '/play/X/end'],
  ['GET', '/wallet'], ['GET', '/wallet/transactions'], ['GET', '/wallet/redemptions'], ['POST', '/wallet/convert'],
  ['GET', '/support/tickets'], ['POST', '/support/tickets'],
  ['POST', '/games/candy-match-3/results'],
  ['GET', '/admin/summary'], ['GET', '/admin/revenue/daily'], ['GET', '/admin/revenue.csv'], ['GET', '/admin/orders'],
  ['GET', '/admin/games'], ['PATCH', '/admin/games/X'], ['POST', '/admin/games/X/result-secret'], ['PATCH', '/admin/plans/X'],
  ['GET', '/admin/redemptions'], ['POST', '/admin/redemptions/X/pay'], ['POST', '/admin/redemptions/X/reject'],
  ['GET', '/admin/tickets'], ['PATCH', '/admin/tickets/X'], ['GET', '/admin/results'],
  ['GET', '/admin/settings/coins'], ['PUT', '/admin/settings/coins'],
];
/** The only routes reachable without a login token, and what protects each instead. */
const PUBLIC = new Map([
  ['GET /health', 'load-balancer health check; returns only {status:"ok"}'],
  ['POST /auth/otp/request', 'login step 1; rate limited, 60 s per phone'],
  ['POST /auth/otp/verify', 'login step 2; 5 tries per code, rate limited'],
  ['POST /auth/telebirr', 'SuperApp login; telebirr verifies the token'],
  ['POST /auth/admin/login', 'admin login; lockout after 5 failures'],
  ['POST /payments/telebirr/notify', 'telebirr server callback; RSA signature + amount check'],
  ['POST /games/candy-match-3/results', 'game supplier callback; HMAC signature + 5 min replay window'],
]);

console.log('\n1. Every route without a token');
for (const [m, p] of ROUTES) {
  const key = `${m} ${p}`;
  const r = await req(m, p, { body: m === 'GET' ? undefined : {} });
  if (PUBLIC.has(key)) {
    check(r.status !== 200 || p === '/health', `${key} is public by design (${PUBLIC.get(key)})`, `→ ${r.status}`);
  } else {
    check(r.status === 401, `${key} → 401 without login`, `got ${r.status}`);
  }
}
const health = await req('GET', '/health');
check(
  JSON.stringify(Object.keys(health.json ?? {}).sort()) === '["service","status"]',
  '/health reveals nothing but status',
);

console.log('\n2. Forged, tampered and stale tokens');
const alice = await customer();
const bob = await customer();
const parts = alice.token.split('.');
const tampered = [parts[0], b64u({ ...JSON.parse(Buffer.from(parts[1], 'base64url')), role: 'ADMIN' }), parts[2]].join('.');
const attacks = {
  'garbage token': 'not-a-jwt',
  'role changed to ADMIN in payload': tampered,
  '"alg: none" token': `${b64u({ alg: 'none', typ: 'JWT' })}.${b64u({ sub: alice.id, role: 'ADMIN', iat: now(), exp: now() + 3600 })}.`,
  'signed with a guessed secret': signJwt({ sub: alice.id, role: 'ADMIN', iat: now(), exp: now() + 3600 }, 'secret'),
  'HS512 instead of HS256': (() => {
    const head = `${b64u({ alg: 'HS512', typ: 'JWT' })}.${b64u({ sub: alice.id, role: 'USER', iat: now(), exp: now() + 3600 })}`;
    return `${head}.${createHmac('sha512', env.JWT_SECRET).update(head).digest('base64url')}`;
  })(),
  'expired token': signJwt({ sub: alice.id, role: 'USER', iat: now() - 7200, exp: now() - 3600 }, env.JWT_SECRET),
  'valid signature, user does not exist': signJwt({ sub: 'nosuchuser', role: 'ADMIN', iat: now(), exp: now() + 3600 }, env.JWT_SECRET),
  'valid signature, no subject': signJwt({ role: 'ADMIN', iat: now(), exp: now() + 3600 }, env.JWT_SECRET),
};
for (const [name, tok] of Object.entries(attacks)) {
  const r = await req('GET', '/auth/me', { token: tok });
  check(r.status === 401, `${name} → 401`, `got ${r.status}`);
}
const forgedAdminRole = signJwt({ sub: alice.id, role: 'ADMIN', iat: now(), exp: now() + 3600 }, env.JWT_SECRET);
check(
  (await req('GET', '/admin/summary', { token: forgedAdminRole })).status === 403,
  'customer token claiming role ADMIN (even correctly signed) → 403: role comes from the database',
);
const temp = await customer();
sql(`delete from "User" where id='${temp.id}'`);
check((await req('GET', '/auth/me', { token: temp.token })).status === 401, 'token of a deleted account → 401 immediately');

console.log('\n3. Customer token on every admin route');
for (const [m, p] of ROUTES.filter(([, p]) => p.startsWith('/admin'))) {
  const r = await req(m, p, { token: alice.token, body: m === 'GET' ? undefined : {} });
  check(r.status === 403, `${m} ${p} → 403 for a customer`, `got ${r.status}`);
}

console.log("\n4. Reading or controlling another customer's data (IDOR)");
const game = (await req('GET', '/games/fast-dice', { token: alice.token })).json;
const order = (await req('POST', '/payments/checkout', { token: alice.token, body: { planId: game.plans[0].id } })).json;
check(!!order?.merchOrderId, 'Alice created an order');
for (const p of [`/payments/orders/${order.merchOrderId}`, `/payments/orders/${order.merchOrderId}/checkout-info`]) {
  check((await req('GET', p, { token: bob.token })).status === 404, `Bob cannot read Alice's order (${p.split('/').slice(-1)[0]})`);
}
const bobPays = await req('POST', '/payments/mock/complete', { token: bob.token, body: { merchOrderId: order.merchOrderId, success: true } });
check(bobPays.status === 404 || bobPays.status === 403, "Bob cannot confirm Alice's payment", `got ${bobPays.status}`);
const demo = (await req('POST', '/play/start', { token: alice.token, body: { slug: 'fast-dice', mode: 'DEMO' } })).json;
check((await req('POST', `/play/${demo.sessionId}/heartbeat`, { token: bob.token })).status === 404, "Bob cannot send heartbeats for Alice's game session");
check((await req('POST', `/play/${demo.sessionId}/end`, { token: bob.token, body: {} })).status === 404, "Bob cannot end Alice's game session");
await req('POST', `/play/${demo.sessionId}/end`, { token: alice.token, body: {} });
const myOrders = (await req('GET', '/payments/orders', { token: bob.token })).json;
check(Array.isArray(myOrders) && !myOrders.some((o) => o.merchOrderId === order.merchOrderId), "Bob's order list does not include Alice's order");
await req('POST', '/support/tickets', { token: alice.token, body: { subject: 'Private', message: 'Alice private message' } });
const bobTickets = (await req('GET', '/support/tickets', { token: bob.token })).json;
check(Array.isArray(bobTickets) && !bobTickets.some((t) => t.message === 'Alice private message'), "Bob cannot see Alice's support tickets");

console.log('\n5. Payment and login bypasses');
const forged = await req('POST', '/payments/telebirr/notify', { body: { merch_order_id: order.merchOrderId, trade_status: 'Completed', total_amount: '3.00' } });
check(forged.status === 403 || forged.status === 400, 'unsigned "payment completed" callback is rejected', `got ${forged.status}`);
const afterForge = (await req('GET', `/payments/orders/${order.merchOrderId}`, { token: alice.token })).json;
check(afterForge?.status === 'PENDING', 'order is still unpaid after the forged callback');
const mockSso = await req('POST', '/auth/telebirr', { body: { authToken: `mock-${alice.phone}` } });
check(mockSso.status === 401, 'simulated telebirr login ("mock-<phone>") is disabled', `got ${mockSso.status}`);
const wrongCode = await req('POST', '/auth/otp/verify', { body: { phone: alice.phone, code: '000000' } });
check(wrongCode.status === 401, 'login with a wrong/used code → 401');
const unsignedResult = await req('POST', '/games/candy-match-3/results', { body: { resultId: 'x', sessionId: 'x', score: 999999 } });
check([401, 404].includes(unsignedResult.status), 'unsigned game result → rejected', `got ${unsignedResult.status}`);

console.log('\n6. Malicious or unexpected input');
const extra = await req('POST', '/support/tickets', { token: alice.token, body: { subject: 'Hello', message: 'Hello there', status: 'RESOLVED', userId: bob.id } });
check(extra.status === 400, 'extra fields (status, userId) in a request → 400 (no mass assignment)', `got ${extra.status}`);
const roleUp = await req('POST', '/auth/otp/verify', { body: { phone: alice.phone, code: '123456', role: 'ADMIN' } });
check(roleUp.status === 400, 'role field in login request → 400', `got ${roleUp.status}`);
check((await req('POST', '/wallet/convert', { token: alice.token, body: { coins: -500 } })).status === 400, 'negative coin conversion → 400');
check((await req('POST', '/wallet/convert', { token: alice.token, body: { coins: '100; DROP TABLE "User"' } })).status === 400, 'text in a number field → 400');
check((await req('POST', '/wallet/convert', { token: alice.token, body: { coins: 1_000_000 } })).status === 400, 'converting more coins than owned → 400');
for (const p of [`/games/${encodeURIComponent("' OR 1=1--")}`, `/games/${encodeURIComponent('../../etc/passwd')}`, `/payments/orders/${encodeURIComponent("1' OR '1'='1")}`]) {
  const r = await req('GET', p, { token: alice.token });
  check(r.status === 404, `injection attempt ${decodeURIComponent(p)} → 404`, `got ${r.status}`);
}
check((await req('GET', '/admin/orders?status=PAID%27%20OR%201=1', { token: alice.token })).status === 403, 'admin filter injection as customer → 403');
const big = await req('POST', '/support/tickets', { token: alice.token, raw: JSON.stringify({ subject: 'x', message: 'A'.repeat(60_000) }) });
check(big.status === 413, 'request body over 50 KB → 413', `got ${big.status}`);
const bad = await req('POST', '/support/tickets', { token: alice.token, raw: '{"subject":' });
check(bad.status === 400 && !/at \w+ \(|node_modules|\.ts:\d+/.test(bad.text), 'broken JSON → 400 without stack traces');
const unknown = await req('GET', '/does-not-exist', { token: alice.token });
check(unknown.status === 404 && !/node_modules|\.ts:\d+/.test(unknown.text), 'unknown route → 404 without internals');

console.log('\n7. Admin account protection');
const adminLogin = await req('POST', '/auth/admin/login', { body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD } });
const adminTok = adminLogin.json?.accessToken;
check(!!adminTok, 'admin can log in');
const claims = JSON.parse(Buffer.from(adminTok.split('.')[1], 'base64url'));
check(claims.exp - claims.iat <= 8 * 3600, `admin session expires within 8 hours (${(claims.exp - claims.iat) / 3600} h)`);
const custAsAdmin = await req('POST', '/auth/admin/login', { body: { email: `nobody-${Date.now()}@example.com`, password: 'x' } });
const wrongPw = await req('POST', '/auth/admin/login', { body: { email: env.ADMIN_EMAIL, password: 'definitely-wrong' } });
check(
  custAsAdmin.status === 401 && wrongPw.status === 401 && custAsAdmin.json?.message === wrongPw.json?.message,
  'same message for unknown email and wrong password (no account discovery)',
);
const ghost = `pentest-${Date.now()}@example.com`;
const codes = [];
for (let i = 0; i < 6; i++) codes.push((await req('POST', '/auth/admin/login', { body: { email: ghost, password: `wrong${i}` } })).status);
check(codes.slice(0, 5).every((c) => c === 401) && codes[5] === 429, 'admin login locks after 5 wrong passwords', codes.join(','));
const games = (await req('GET', '/admin/games', { token: adminTok })).json;
check(Array.isArray(games) && games.every((g) => !('resultSecret' in g)), 'admin game list never returns game result secrets');

console.log('\n8. Reconciliation CSV formula injection');
const target = games.find((g) => g.slug === 'candy-match-3');
const original = target.title;
await req('PATCH', `/admin/games/${target.id}`, { token: adminTok, body: { title: '=HYPERLINK("http://evil")' } });
try {
  const csv = (await req('GET', '/admin/revenue.csv?from=2020-01-01', { token: adminTok })).text;
  const hit = csv.split('\n').find((l) => l.includes('HYPERLINK'));
  check(!hit || /,"'=HYPERLINK/.test(hit) || /,'=HYPERLINK/.test(hit), 'game title starting with "=" is neutralised in the CSV', hit ?? '');
} finally {
  await req('PATCH', `/admin/games/${target.id}`, { token: adminTok, body: { title: original } });
}

console.log('\n9. HTTP security headers, CORS, exposure');
const h = (await req('GET', '/health')).headers;
check(!h.get('x-powered-by'), 'API hides x-powered-by');
check(h.get('x-content-type-options') === 'nosniff', 'API sends X-Content-Type-Options: nosniff');
check(!!h.get('content-security-policy'), 'API sends Content-Security-Policy');
check(!!h.get('strict-transport-security'), 'API sends Strict-Transport-Security');
const cors = await fetch(`${API}/health`, { headers: { Origin: 'https://evil.example' } });
check(cors.headers.get('access-control-allow-origin') !== 'https://evil.example', 'CORS does not allow other websites');
const pre = await fetch(`${API}/wallet`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } });
check(pre.headers.get('access-control-allow-origin') !== 'https://evil.example', 'CORS pre-flight from another website is not allowed');
const web = await fetch(WEB, { redirect: 'manual' });
const wh = web.headers;
check(!wh.get('x-powered-by'), 'website hides x-powered-by (no "Next.js")');
check(/frame-ancestors 'none'/.test(wh.get('content-security-policy') ?? '') && wh.get('x-frame-options') === 'DENY', 'website cannot be framed (clickjacking)');
check(/connect-src 'self' http:\/\/localhost:4000/.test(wh.get('content-security-policy') ?? ''), 'website may only call the teleGame API');
check(wh.get('x-content-type-options') === 'nosniff' && !!wh.get('referrer-policy'), 'website sends nosniff and Referrer-Policy');
for (const p of ['/.env', '/backend/.env', '/../backend/.env', '/.git/config']) {
  const r = await fetch(WEB + p);
  const t = await r.text();
  check(!/JWT_SECRET|DATABASE_URL|\[core\]/.test(t), `website does not serve ${p}`);
}
const port = execSync('docker port telegame-postgres').toString();
check(!/0\.0\.0\.0|\[::\]/.test(port) && /127\.0\.0\.1:5434/.test(port), 'database port only reachable from this computer', port.trim());

console.log('\n10. Rate limits');
const statuses = [];
for (let i = 0; i < 7; i++) statuses.push((await req('POST', '/auth/otp/request', { body: { phone: randPhone() } })).status);
check(statuses.includes(429), 'login-code requests are rate limited per IP', statuses.join(','));

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) {
  console.log('SECURITY AUDIT FAILED');
  process.exit(1);
}
console.log('SECURITY AUDIT PASSED');
