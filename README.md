# teleGame — telebirr SuperApp Game Center

Implementation of **LEMAT TECHNOLOGY PLC's RFP response to Ethio Telecom** ("Games Provisioning on telebirr SuperApp Game Center").

| Part | Stack | Folder |
|---|---|---|
| Backend API | NestJS 11, Prisma 6, PostgreSQL 16 | [`backend/`](backend/) |
| Frontend (customer H5 app + admin) | Next.js 15 (App Router), Tailwind CSS 4 | [`frontend/`](frontend/) |

## Customer Journey (proposal section 2.2)

The app follows the proposal's Customer Journey exactly. Each step maps to one screen and one API endpoint. Every customer screen shows a "Step N of 8" tracker.

| # | Customer Journey step (proposal wording) | Screen | API |
|---|---|---|---|
| 1 | Customer opens telebirr Game Center. | `/` (SuperApp single sign-on or `/login` OTP) | `POST /api/auth/telebirr`, `POST /api/auth/otp/*` |
| 2 | Customer discovers/selects an available game. | `/`, `/games/[slug]` | `GET /api/games`, `GET /api/games/:slug` |
| 3 | Customer completes the applicable purchase/subscription flow where the game is monetized. | `/games/[slug]` (Daily / Weekly / Monthly / Pay per play) | `POST /api/payments/checkout` |
| 4 | Payment is processed through the approved telebirr/payment integration. | telebirr checkout (`/mock-telebirr/checkout` in development) | `POST /api/payments/telebirr/notify` |
| 5 | Successful transaction results in the applicable game access/entitlement. | `/payment/result` | `GET /api/payments/orders/:id` |
| 6 | Customer launches and uses the game. | `/play/[slug]` | `POST /api/play/start`, `/heartbeat` |
| 7 | Customers play the purchased games and accumulate the coins. | `/play/[slug]` → coin summary | `POST /api/play/:id/end` |
| 8 | Customer can change/convert the accumulated coins into ETB/e-money in hassle free ways. | `/wallet` | `POST /api/wallet/convert` |

### Business rules from the proposal

- **Games (2.1):** the 8 games, with their categories, descriptions, target audiences and URLs, are loaded by `npm run seed`.
- **Pricing (3.1):** Daily 3 ETB, Weekly 10 ETB, Monthly 45 ETB, or pay-per-use. Prices are editable in the admin under *Games & pricing*.
- **Revenue sharing (3.2):**
  - Net revenue = gross − VAT − other statutory taxes.
  - Net revenue is split **LEMAT 70% / Ethio Telecom 30%**.
  - The split is stored on every paid order.
  - Admin shows it per day, plan and game, and exports a reconciliation CSV.
- **Trial (3.3):** free demo plays (3 per game per day, 3 minutes each). Demos earn no coins.
- **Support (4.4):** customers open tickets under *Help*; admins answer under *Support*.
- **Data protection (6.2):**
  - Customer numbers are masked in reports and exports.
  - OTP codes are hashed.
  - Payment callbacks are signature-verified.

### Coin rules (steps 7–8)

Limits and rates are configurable in `backend/.env`. Each game earns coins in one of two ways, chosen in admin → *Games & pricing*:

| Mode | How coins are earned | Needs |
|---|---|---|
| **Play time** (default) | Server-measured active play time. The app sends heartbeats every 15 s; hidden or idle time is not counted. | Nothing; works with any game |
| **Score** | `floor(score / pointsPerCoin)` per result, reported by the **game supplier's server** and signed with HMAC-SHA256 using a per-game secret. Forged, replayed, duplicate and demo results earn nothing. | The supplier implements [docs/GAME-RESULTS-API.md](docs/GAME-RESULTS-API.md) |

Scores sent from the customer's phone are never paid, because they can be faked. Score-mode games receive the play session id in their launch URL (`?tg_session=…`) so the supplier's server can report results for it.

Common rules:

- Default rates and limits:
  - Play time: 2 coins per minute. Score: 100 points = 1 coin (set per game).
  - At most 60 coins per session and 200 per day, in both modes.
  - 100 coins = 1 ETB.
  - Minimum conversion is 100 coins.
- Conversions are debited atomically. Payout modes:
  - `PAYOUT_PROVIDER=mock`: paid instantly (simulated).
  - `PAYOUT_PROVIDER=manual`: wait for an operator to send the e-money and mark the conversion paid. Rejected conversions refund the coins.

## Run it locally

Prerequisites: Node.js 20+, Docker Desktop.

```bash
# 1. database (PostgreSQL on localhost:5434)
docker compose up -d

# 2. backend  ->  http://localhost:4000/api
cd backend
cp .env.example .env          # then set JWT_SECRET to a long random string
npm install
npx prisma migrate deploy
npm run seed                  # 8 games x 4 plans + admin account
npm run start:dev

# 3. frontend  ->  http://localhost:3000
cd ../frontend
cp .env.example .env.local
npm install
npm run dev
```

- **Customer app:** <http://localhost:3000>. Log in with any Ethio telecom number (e.g. `0911223344`). In development, the OTP code is shown on screen.
- **Admin:** <http://localhost:3000/admin>, using `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `backend/.env` (default `admin@lemattech.com` / `ChangeMe123!`).

### Checks

```bash
cd backend && npm test               # revenue split, coins, phone, time zone, telebirr + result signatures
node scripts/journey-check.mjs       # with the API running: walks all 8 journey steps end to end
node scripts/score-check.mjs         # with the API running: acts as a game supplier, tests score coins and attacks
```

Both scripts edit play time directly in the local Docker database to simulate long sessions. Use them only against development.

## Look and feel

- **Inside telebirr:** the customer app uses the telebirr SuperApp style (green header and bottom bar, yellow promo strip, blue action buttons), so it feels native when opened as a mini app. Ethio telecom / telebirr logos are not included; use the official assets provided during telebirr onboarding.
- **Game artwork:** each game's own icon (`icon-256.png`, referenced in the game's `index.html`), stored in `frontend/public/games/<slug>.png`. Games without artwork fall back to a generated cover.

## Going live with telebirr

Development uses a simulated telebirr (`PAYMENT_PROVIDER=mock`). The real integration is implemented in `backend/src/payments/providers/telebirr.provider.ts`:
- **H5 C2B web checkout:** fabric token → `preOrder` signed with SHA256WithRSA (PSS) → checkout URL.
- **Payment notification:** the `notify_url` callback is signature-verified, idempotent, and cross-checks the amount.
- **SuperApp single sign-on:** `authToken` → customer identity. The frontend bridge is in `frontend/src/lib/telebirr-bridge.ts`.

Before production (proposal section 4.2: "final integration architecture … shall be agreed with Ethio Telecom/telebirr"):

1. Obtain merchant credentials from telebirr: fabric app id, app secret, merchant app id, short code, RSA key pair and telebirr public key. Set them in `backend/.env` and switch to `PAYMENT_PROVIDER=telebirr`.
2. Validate the endpoints, field names, signature format and SuperApp JS bridge against telebirr's current integration guide in their test environment.
3. Expose `PUBLIC_API_URL` over HTTPS so telebirr can reach `/api/payments/telebirr/notify`.
4. Set `OTP_DEV_ECHO=false` and connect an SMS gateway in `AuthService.requestOtp`, or rely on SuperApp single sign-on only.
5. Use `PAYOUT_PROVIDER=manual` until an automated telebirr B2C disbursement API is agreed.
6. Confirm with Ethio Telecom the open commercial points:
   - pay-per-use price (seeded at 1 ETB);
   - whether prices are VAT-inclusive (`PRICES_INCLUDE_VAT`);
   - coin earning and conversion rates;
   - regulatory approval for converting coins to e-money.
7. Change the admin password and `JWT_SECRET`, and serve both apps over HTTPS.
8. For score-based coins, send each game supplier its result secret and [docs/GAME-RESULTS-API.md](docs/GAME-RESULTS-API.md). Switch a game to *Score* only after its results appear correctly under *Recent results*.
