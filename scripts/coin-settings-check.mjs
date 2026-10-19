// End-to-end check of Admin → Coin settings (coins per X minutes, limits, conversion rate).
// Run with the API on http://localhost:4000 and the local Docker database (development only).
// Restores the original settings at the end.
import { execSync } from 'node:child_process';

const API = 'http://localhost:4000/api';
const sql = (q) =>
  execSync(`docker exec telegame-postgres psql -U telegame -d telegame -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const ok = (cond, msg) => {
  if (!cond) throw new Error('FAILED: ' + msg);
  console.log('  ✓', msg);
};
async function call(method, path, { body, token } = {}, expect = [200, 201]) {
  const res = await fetch(API + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!expect.includes(res.status)) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}
const FIELDS = ['coinsPerInterval', 'intervalMinutes', 'maxPerSession', 'maxPerDay', 'coinsPerEtb', 'minRedeem'];
const pick = (s) => Object.fromEntries(FIELDS.map((k) => [k, s[k]]));

const admin = (await call('POST', '/auth/admin/login', { body: { email: 'admin@lemattech.com', password: 'ChangeMe123!' } })).accessToken;
const original = pick(await call('GET', '/admin/settings/coins', { token: admin }));
console.log('Current settings:', JSON.stringify(original));

try {
  console.log('Only admins, only valid values');
  const phone = '09' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const user = (await call('POST', '/auth/telebirr', { body: { authToken: `mock-${phone}` } })).accessToken;
  await call('GET', '/admin/settings/coins', { token: user }, [403]);
  await call('PUT', '/admin/settings/coins', { token: user, body: original }, [403]);
  ok(true, 'customers cannot read or change coin settings (403)');
  await call('PUT', '/admin/settings/coins', { token: admin, body: { ...original, maxPerSession: 500, maxPerDay: 100 } }, [400]);
  ok(true, 'per-day limit below per-session limit -> 400');
  await call('PUT', '/admin/settings/coins', { token: admin, body: { ...original, intervalMinutes: 0 } }, [400]);
  ok(true, '0-minute interval -> 400');
  await call('PUT', '/admin/settings/coins', { token: admin, body: { coinsPerInterval: 5 } }, [400]);
  ok(true, 'incomplete settings -> 400');

  console.log('Admin sets 5 coins every 2 minutes, 50 coins = 1 ETB');
  const next = { coinsPerInterval: 5, intervalMinutes: 2, maxPerSession: 100, maxPerDay: 300, coinsPerEtb: 50, minRedeem: 20 };
  const saved = await call('PUT', '/admin/settings/coins', { token: admin, body: next });
  ok(saved.coinsPerInterval === 5 && saved.intervalMinutes === 2 && saved.updatedBy === 'admin@lemattech.com', 'saved, with who changed it');

  const game = await call('GET', '/games/traffic-racer', { token: user });
  ok(game.timeCoins.coins === 5 && game.timeCoins.minutes === 2, 'game page shows the new rate immediately');
  const wallet = await call('GET', '/wallet', { token: user });
  ok(wallet.rules.coinsPerInterval === 5 && wallet.rules.coinsPerEtb === 50 && wallet.rules.minRedeemCoins === 20, 'wallet uses the new rules');

  console.log('Customer plays and earns with the new rate');
  const daily = game.plans.find((p) => p.type === 'DAILY');
  const co = await call('POST', '/payments/checkout', { token: user, body: { planId: daily.id } });
  await call('POST', '/payments/mock/complete', { token: user, body: { merchOrderId: co.merchOrderId, success: true } });
  const p1 = await call('POST', '/play/start', { token: user, body: { slug: 'traffic-racer', mode: 'FULL' } });
  ok(p1.coinRules.coinsPerInterval === 5 && p1.coinRules.intervalMinutes === 2, 'play screen gets the new rate');
  sql(`update "PlaySession" set "activeSeconds"=${11 * 60 + 59} where id='${p1.sessionId}'`);
  const e1 = await call('POST', `/play/${p1.sessionId}/end`, { token: user, body: {} });
  ok(e1.coinsEarned === 25, '11 min 59 s of play = 5 full 2-minute intervals = 25 coins');
  const p2 = await call('POST', '/play/start', { token: user, body: { slug: 'traffic-racer', mode: 'FULL' } });
  sql(`update "PlaySession" set "activeSeconds"=3600 where id='${p2.sessionId}'`);
  const e2 = await call('POST', `/play/${p2.sessionId}/end`, { token: user, body: {} });
  ok(e2.coinsEarned === 100 && e2.coinBalance === 125, '60 min would be 150 coins, capped at the new 100-per-session limit');

  console.log('Customer converts with the new rate');
  await call('POST', '/wallet/convert', { token: user, body: { coins: 19 } }, [400]);
  ok(true, 'below the new minimum (20) -> 400');
  const r = await call('POST', '/wallet/convert', { token: user, body: { coins: 20 } });
  ok(r.amountCents === 40, '20 coins at 50 coins = 1 ETB -> 0.40 ETB');
} finally {
  await call('PUT', '/admin/settings/coins', { token: admin, body: original });
  const back = pick(await call('GET', '/admin/settings/coins', { token: admin }));
  ok(JSON.stringify(back) === JSON.stringify(original), 'original settings restored');
}
console.log('\nALL COIN SETTINGS CHECKS PASSED');
