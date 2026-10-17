# Game Results API — integration guide for game suppliers

**Audience:** developers at the game supplier who add server-side result reporting to a game in the telebirr Game Center (operated by LEMAT TECHNOLOGY PLC).

**Why:** in the Game Center, customers earn coins that they can convert into ETB. For a game to pay coins **by score**, its results must come from **your game server**, signed with a secret, never from the player's browser or phone. Anything sent from the device can be edited by the player.

Until a game supports this API it stays on time-based coins: customers earn for verified play time, and nothing changes for you.

---

## 1. Flow

```
 Customer's phone                     Your game server                 Game Center API
 ────────────────                     ────────────────                 ───────────────
 opens  <gameUrl>?tg_session=S  ───►  (game loads, reads tg_session)
 plays a round                  ───►  your server decides the result
                                      (score / level / win)
                                      POST /api/games/<slug>/results ─► verifies signature,
                                      signed with the game secret       credits coins
                                ◄──────────────────────────────────────  200 {coinsAwarded}
```

1. When a customer launches your game, the Game Center opens your game URL with an extra query parameter, **`tg_session`**, e.g. `https://muen-web.tmofamily.com/demo-game/38/index.html?tg_session=cmgv0x1k20003...`.
2. The game front end passes `tg_session` to **your server** with your normal game traffic.
3. When a round, level or match ends, **your server** reports the result to the Game Center. Report every round; the Game Center applies its own limits.

## 2. Credentials (from LEMAT)

For each game you receive:

| Item | Example |
|---|---|
| Game slug | `professor-bubble` |
| Report URL | `https://<game-center-api-host>/api/games/professor-bubble/results` |
| Result secret | 64 hex characters, e.g. `9f2c…e41a` |

- Keep the secret **only on your server**. Never put it in game JavaScript, the APK or a URL.
- If it leaks, ask LEMAT to rotate it. The old secret stops working immediately.

## 3. Request

```
POST /api/games/{slug}/results
Content-Type: application/json
X-TG-Timestamp: 1792261234
X-TG-Signature: 5d1c0b9f...(64 hex chars)

{"resultId":"round-8841-3","sessionId":"cmgv0x1k20003...","score":1550,"level":3,"won":true}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `resultId` | string, 1–100 chars `A-Z a-z 0-9 _ . : -` | yes | **Your** unique id for this result. Sending the same id again is safe: it is never paid twice. |
| `sessionId` | string | yes | The `tg_session` value from the launch URL. |
| `score` | integer ≥ 0 | yes | Points for this round. Express levels or wins as points too (e.g. one level = 100 points). |
| `level` | integer ≥ 0 | no | For reporting. |
| `won` | boolean | no | For reporting. |

### Signature

```
X-TG-Timestamp = current Unix time in seconds
X-TG-Signature = lowercase hex( HMAC-SHA256( key = result secret,
                                             message = X-TG-Timestamp + "." + <exact request body bytes> ) )
```

- Sign the **exact bytes** you send. Serialize the JSON once, sign that string, and send that same string.
- The timestamp must be within **5 minutes** of the Game Center's clock, so keep your server on NTP.

**Node.js**

```js
import { createHmac } from 'node:crypto';

async function reportResult({ slug, secret, result }) {
  const body = JSON.stringify(result);
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  const res = await fetch(`https://<game-center-api-host>/api/games/${slug}/results`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-TG-Timestamp': ts, 'X-TG-Signature': sig },
    body,
  });
  return res.json();
}
```

**PHP**

```php
$body = json_encode($result);
$ts   = (string) time();
$sig  = hash_hmac('sha256', $ts . '.' . $body, $secret);
// POST $body with headers X-TG-Timestamp: $ts and X-TG-Signature: $sig
```

## 4. Responses

| Status | Meaning | What to do |
|---|---|---|
| `200` `{"accepted":true,"duplicate":false,"coinsAwarded":15,...}` | Recorded. `coinsAwarded` may be `0` (demo session or the customer reached a limit). | Done |
| `200` `{"duplicate":true,...}` | This `resultId` was already recorded. | Done (safe to ignore) |
| `400` | Invalid body (missing field, negative score…) | Fix the request; do not retry unchanged |
| `401` `Invalid signature (MISSING / STALE / MISMATCH)` | Headers missing, clock skew > 5 min, or wrong secret / body changed after signing | Check secret, clock and that you sign the exact body |
| `403` `Play session has expired` | Session inactive for 10 min, or ended more than 5 min ago | Report results promptly |
| `404` | Unknown game slug, reporting not enabled, or unknown `sessionId` | Check slug and `tg_session` |
| `5xx` / network error | Temporary problem | Retry with the **same** `resultId` (back off: 1 s, 5 s, 30 s) |

## 5. Rules applied by the Game Center (for information)

- Coins = `floor(score / pointsPerCoin)` per result. `pointsPerCoin` is set per game by LEMAT (default 100).
- Customers earn at most **60 coins per session** and **200 coins per day** across all games. Results beyond that are recorded but pay 0.
- Free demo sessions never earn coins. Their results are recorded with 0 coins.
- Results are accepted while the session is active, and up to 5 minutes after it ends.

## 6. Going live checklist

1. LEMAT generates the secret: admin → *Games & pricing* → *Generate result secret*.
2. Your server reports results from LEMAT's test environment; LEMAT checks them in admin → *Games & pricing* → *Recent results*.
3. LEMAT switches the game to **Score-based coins**. From then on, coins for that game come only from your reported results.
