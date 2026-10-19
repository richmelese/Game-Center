// End-to-end check of SCORE-mode coins: acts as the game supplier's server.
// Run with the API on http://localhost:4000 and the local Docker database (development only).
import { createHmac } from 'node:crypto';
import { execSync } from 'node:child_process';

const API = 'http://localhost:4000/api';
const SLUG = 'professor-bubble';
// fresh result ids every run: the API (correctly) never pays the same result id twice
const RUN = Date.now().toString(36);
const sql = (q) =>
  execSync(`docker exec telegame-postgres psql -U telegame -d telegame -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const ok = (cond, msg) => {
  if (!cond) throw new Error('FAILED: ' + msg);
  console.log('  ✓', msg);
};

async function call(method, path, { body, token, raw, headers = {} } = {}, expect = [200, 201]) {
  const payload = raw ?? (body ? JSON.stringify(body) : undefined);
  const res = await fetch(API + path, {
    method,
    headers: {
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: payload,
  });
  const text = await res.text();
  if (!expect.includes(res.status)) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

/** What the supplier's server does: sign "<timestamp>.<body>" with the game secret. */
function report(secret, result, { tsOffset = 0, tamper, expect = [200] } = {}) {
  const body = JSON.stringify(result);
  const ts = String(Math.floor(Date.now() / 1000) + tsOffset);
  const sig = createHmac('sha256', secret).update(`${ts}.`).update(body).digest('hex');
  return call(
    'POST',
    `/games/${SLUG}/results`,
    { raw: tamper ? tamper(body) : body, headers: { 'X-TG-Timestamp': ts, 'X-TG-Signature': sig } },
    expect,
  );
}

console.log('Admin enables score-based coins for Professor Bubble');
const admin = (await call('POST', '/auth/admin/login', { body: { email: 'admin@lemattech.com', password: 'ChangeMe123!' } })).data.accessToken;
const game = (await call('GET', '/admin/games', { token: admin })).data.find((g) => g.slug === SLUG);
ok(game && !('resultSecret' in game), 'admin game list never exposes the secret');
if (!game.hasResultSecret) {
  await call('PATCH', `/admin/games/${game.id}`, { token: admin, body: { coinMode: 'SCORE' } }, [400]);
  ok(true, 'cannot switch to SCORE before a secret exists');
}
const { resultSecret } = (await call('POST', `/admin/games/${game.id}/result-secret`, { token: admin })).data;
ok(/^[0-9a-f]{64}$/.test(resultSecret), 'result secret generated (shown once)');
const updated = (await call('PATCH', `/admin/games/${game.id}`, { token: admin, body: { coinMode: 'SCORE', pointsPerCoin: 100 } })).data;
ok(updated.coinMode === 'SCORE' && updated.hasResultSecret && !('resultSecret' in updated), 'game set to SCORE, 100 points = 1 coin');

console.log('Customer buys and launches the game');
const phone = '09' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
const user = (await call('POST', '/auth/telebirr', { body: { authToken: `mock-${phone}` } })).data.accessToken;
const detail = (await call('GET', `/games/${SLUG}`, { token: user })).data;
ok(detail.coinMode === 'SCORE' && detail.pointsPerCoin === 100, 'game page shows score-based coins');
const daily = detail.plans.find((p) => p.type === 'DAILY');
const co = (await call('POST', '/payments/checkout', { token: user, body: { planId: daily.id } })).data;
await call('POST', '/payments/mock/complete', { token: user, body: { merchOrderId: co.merchOrderId, success: true } });
const play = (await call('POST', '/play/start', { token: user, body: { slug: SLUG, mode: 'FULL' } })).data;
const launch = new URL(play.game.gameUrl);
ok(launch.searchParams.get('tg_session') === play.sessionId, `launch URL carries tg_session for the supplier`);
const sessionId = play.sessionId;

console.log('Supplier reports results');
const r1 = (await report(resultSecret, { resultId: `${RUN}-round-1`, sessionId, score: 1550, level: 3, won: true })).data;
ok(r1.coinsAwarded === 15 && !r1.duplicate, 'score 1550 -> 15 coins');
const again = (await report(resultSecret, { resultId: `${RUN}-round-1`, sessionId, score: 1550 })).data;
ok(again.duplicate && again.coinsAwarded === 15, 'same resultId again is a duplicate (paid once)');
const hb = (await call('POST', `/play/${sessionId}/heartbeat`, { token: user })).data;
ok(hb.coinsSoFar === 15, 'live coin counter shows score coins');

console.log('Attacks are rejected');
await report(resultSecret, { resultId: `${RUN}-round-x`, sessionId, score: 500 }, {
  tamper: (b) => b.replace('500', '9999999'), expect: [401],
});
ok(true, 'inflated score with the original signature -> 401');
await report('f'.repeat(64), { resultId: `${RUN}-round-y`, sessionId, score: 500 }, { expect: [401] });
ok(true, 'signed with a wrong secret -> 401');
await report(resultSecret, { resultId: `${RUN}-round-z`, sessionId, score: 500 }, { tsOffset: -600, expect: [401] });
ok(true, 'replayed / 10-minute-old timestamp -> 401');
await call('POST', `/games/${SLUG}/results`, { body: { resultId: `${RUN}-nohdr`, sessionId, score: 1 } }, [401]);
ok(true, 'unsigned request -> 401');
await report(resultSecret, { resultId: `${RUN}-round-n`, sessionId, score: -5 }, { expect: [400] });
ok(true, 'negative score -> 400');
await report(resultSecret, { resultId: `${RUN}-round-u`, sessionId: 'nosuchsession', score: 100 }, { expect: [404] });
ok(true, 'unknown session -> 404');
const balanceBefore = Number(sql(`select "coinBalance" from "User" where phone='251${phone.slice(1)}'`));
ok(balanceBefore === 15, 'no coins paid by any rejected request');

console.log('Caps still apply');
const big = (await report(resultSecret, { resultId: `${RUN}-round-2`, sessionId, score: 1_000_000 })).data;
ok(big.coinsAwarded === 45, 'huge score capped at the 60-coin session limit (15 + 45)');
const over = (await report(resultSecret, { resultId: `${RUN}-round-3`, sessionId, score: 5000 })).data;
ok(over.coinsAwarded === 0, 'session cap reached -> 0 coins, result still recorded');

console.log('Ending the session pays no extra time coins');
sql(`update "PlaySession" set "activeSeconds"=3600 where id='${sessionId}'`);
const end = (await call('POST', `/play/${sessionId}/end`, { token: user, body: {} })).data;
ok(end.coinsEarned === 60 && end.coinBalance === 60, 'session total 60 coins, no time-based coins on top');
const late = (await report(resultSecret, { resultId: `${RUN}-round-4`, sessionId, score: 100 })).data;
ok(late.coinsAwarded === 0, 'late result within grace period accepted (cap already reached)');

console.log('Demo sessions never earn');
const demo = (await call('POST', '/play/start', { token: user, body: { slug: SLUG, mode: 'DEMO' } })).data;
const d = (await report(resultSecret, { resultId: `${RUN}-demo-1`, sessionId: demo.sessionId, score: 10_000 })).data;
ok(d.coinsAwarded === 0, 'demo result recorded, 0 coins');
await call('POST', `/play/${demo.sessionId}/end`, { token: user, body: {} });

const monitor = (await call('GET', `/admin/results?gameId=${game.id}`, { token: admin })).data;
ok(monitor.some((r) => r.resultId === `${RUN}-round-1` && r.coinsAwarded === 15), 'admin can monitor reported results');

// leave the demo database as it was: game back on time-based coins
await call('PATCH', `/admin/games/${game.id}`, { token: admin, body: { coinMode: 'TIME' } });
console.log('\nALL SCORE CHECKS PASSED');
