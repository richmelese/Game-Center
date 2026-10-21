// End-to-end check of the proposal's Customer Journey against the running API.
import { execSync } from 'node:child_process';

const API = 'http://localhost:4000/api';
let token = '';
const call = async (method, path, body, expect = [200, 201]) => {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text && res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text;
  if (!expect.includes(res.status)) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  return { status: res.status, data };
};
const sql = (q) => execSync(`docker exec telegame-postgres psql -U telegame -d telegame -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const ok = (cond, msg) => { if (!cond) throw new Error('FAILED: ' + msg); console.log('  ✓', msg); };
const phone = '09' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');

console.log('Step 1 - customer opens telebirr Game Center (phone + code login)');
await call('GET', '/games', null, [401]);
ok(true, 'catalog is closed without a login (401)');
const otp = await call('POST', '/auth/otp/request', { phone });
ok(/^\d{6}$/.test(otp.data.devCode), 'login code sent (echoed in development)');
const sso = await call('POST', '/auth/otp/verify', { phone, code: otp.data.devCode });
token = sso.data.accessToken;
ok(sso.data.user.phone === '251' + phone.slice(1), `logged in as ${sso.data.user.phone}`);

console.log('Step 2 - discovers / selects a game');
const list = await call('GET', '/games');
ok(list.data.games.length === 8, '8 games in the catalog');
const g = await call('GET', '/games/candy-match-3');
const types = g.data.plans.map((p) => `${p.type}:${p.priceCents / 100}`).join(' ');
ok(types === 'DAILY:3 WEEKLY:10 MONTHLY:45 PAY_PER_USE:1', `plans ${types}`);
ok(g.data.access.hasAccess === false && g.data.access.demoPlaysLeft === 3, 'no access yet, 3 free demo plays');

console.log('   (demo / trial game)');
const demo = await call('POST', '/play/start', { slug: 'candy-match-3', mode: 'DEMO' });
ok(demo.data.demoSeconds === 180, 'demo session started, 180 s limit');
const demoEnd = await call('POST', `/play/${demo.data.sessionId}/end`, {});
ok(demoEnd.data.coinsEarned === 0, 'demo earns no coins');
await call('POST', '/play/start', { slug: 'candy-match-3', mode: 'FULL' }, [402]);
ok(true, 'full play without purchase -> 402 Payment Required');

console.log('Step 3 - completes the subscription flow (Weekly 10 ETB)');
const weekly = g.data.plans.find((p) => p.type === 'WEEKLY');
const co = await call('POST', '/payments/checkout', { planId: weekly.id });
ok(co.data.checkoutUrl.includes('/mock-telebirr/checkout?order='), `checkout URL ${co.data.checkoutUrl}`);

console.log('Step 4 - payment processed through telebirr');
const paid = await call('POST', '/payments/mock/complete', { merchOrderId: co.data.merchOrderId, success: true });
ok(paid.data.status === 'PAID', 'order PAID');
await call('POST', '/payments/mock/complete', { merchOrderId: co.data.merchOrderId, success: true });
ok(sql(`select count(*) from "Entitlement" e join "Order" o on o.id=e."orderId" where o."merchOrderId"='${co.data.merchOrderId}'`) === '1', 'repeat notification is idempotent (one entitlement)');
const split = sql(`select "vatCents"||','||"netCents"||','||"partnerShareCents"||','||"operatorShareCents" from "Order" where "merchOrderId"='${co.data.merchOrderId}'`);
ok(split === '130,870,609,261', `revenue split VAT/net/LEMAT 70%/ET 30% (santim) = ${split}`);

console.log('Step 5 - entitlement granted');
ok(paid.data.entitlement?.type === 'WEEKLY' && paid.data.entitlement.expiresAt, `weekly access until ${paid.data.entitlement.expiresAt}`);
const g2 = await call('GET', '/games/candy-match-3');
ok(g2.data.access.hasAccess === true, 'game page shows access');

console.log('Step 6 - launches and uses the game');
const play = await call('POST', '/play/start', { slug: 'candy-match-3', mode: 'FULL' });
ok(play.data.game.gameUrl.startsWith('https://muen-web.tmofamily.com/'), 'full session with game URL');
const hb = await call('POST', `/play/${play.data.sessionId}/heartbeat`);
ok(hb.data.ended === false, 'heartbeat accepted');

console.log('Step 7 - plays and accumulates coins');
sql(`update "PlaySession" set "activeSeconds"=330 where id='${play.data.sessionId}'`); // simulate 5.5 min of play
const end = await call('POST', `/play/${play.data.sessionId}/end`, { score: 1234 });
ok(end.data.coinsEarned === 10, `earned ${end.data.coinsEarned} coins for 5 full minutes`);
const again = await call('POST', `/play/${play.data.sessionId}/end`, {});
ok(again.data.coinBalance === 10, 'ending twice does not pay twice');
// a long session is capped at 60 coins
const play2 = await call('POST', '/play/start', { slug: 'candy-match-3', mode: 'FULL' });
sql(`update "PlaySession" set "activeSeconds"=7200 where id='${play2.data.sessionId}'`);
const end2 = await call('POST', `/play/${play2.data.sessionId}/end`, {});
ok(end2.data.coinsEarned === 60 && end2.data.coinBalance === 70, 'per-session cap 60 coins, balance 70');

console.log('Step 8 - converts coins into ETB / e-money');
await call('POST', '/wallet/convert', { coins: 50 }, [400]);
ok(true, 'below minimum (100) is rejected');
const play3 = await call('POST', '/play/start', { slug: 'candy-match-3', mode: 'FULL' });
sql(`update "PlaySession" set "activeSeconds"=3600 where id='${play3.data.sessionId}'`);
await call('POST', `/play/${play3.data.sessionId}/end`, {});
const w = await call('GET', '/wallet');
ok(w.data.coinBalance === 130 && w.data.etbValueCents === 130, `wallet 130 coins = ${w.data.etbValueCents / 100} ETB`);
const conv = await call('POST', '/wallet/convert', { coins: 120 });
ok(conv.data.status === 'PAID' && conv.data.amountCents === 120, `converted 120 coins -> ${conv.data.amountCents / 100} ETB to ${conv.data.msisdn}`);
const w2 = await call('GET', '/wallet');
ok(w2.data.coinBalance === 10, 'balance 10 coins after conversion');
await call('POST', '/wallet/convert', { coins: 1000 }, [400]);
ok(true, 'cannot convert more than balance');

console.log('Pay-per-use');
const ppu = g.data.plans.find((p) => p.type === 'PAY_PER_USE');
const co2 = await call('POST', '/payments/checkout', { planId: ppu.id });
await call('POST', '/payments/mock/complete', { merchOrderId: co2.data.merchOrderId, success: true });
const fast = await call('GET', '/games/fast-dice');
await call('POST', '/payments/mock/complete', { merchOrderId: (await call('POST', '/payments/checkout', { planId: fast.data.plans.find((p) => p.type === 'PAY_PER_USE').id })).data.merchOrderId, success: true });
const p1 = await call('POST', '/play/start', { slug: 'fast-dice', mode: 'FULL' });
ok(!!p1.data.sessionId, 'pay-per-use play consumed');
await call('POST', '/play/start', { slug: 'fast-dice', mode: 'FULL' }, [402]);
ok(true, 'second play needs a new purchase');
const cancel = await call('POST', '/payments/checkout', { planId: weekly.id });
const cancelled = await call('POST', '/payments/mock/complete', { merchOrderId: cancel.data.merchOrderId, success: false });
ok(cancelled.data.status === 'CANCELLED', 'cancelled payment grants nothing');

console.log('Admin - revenue sharing report');
token = '';
const admin = await call('POST', '/auth/admin/login', { email: 'admin@lemattech.com', password: 'ChangeMe123!' });
token = admin.data.accessToken;
const sum = await call('GET', '/admin/summary');
const r = sum.data.revenue;
ok(r.partnerShareCents + r.operatorShareCents === r.netCents && r.vatCents + r.netCents === r.grossCents, `gross ${r.grossCents / 100} ETB, net ${r.netCents / 100}, LEMAT ${r.partnerShareCents / 100}, Ethio Telecom ${r.operatorShareCents / 100}`);
const csv = await call('GET', '/admin/revenue.csv');
ok(csv.data.split('\n')[0].startsWith('merch_order_id,telebirr_txn_id'), 'reconciliation CSV export');
token = sso.data.accessToken;
await call('GET', '/admin/summary', null, [403]);
ok(true, 'customers cannot open admin endpoints');
console.log('\nALL JOURNEY CHECKS PASSED');
