# teleGame — security review and penetration-test brief

Prepared before the internal penetration test. Covers the NestJS API (in the separate `Game-center-backend` repo), the Vite/React website (this repo) and the local PostgreSQL database.

Automated proof: `node scripts/security-audit.mjs` runs **115 attack checks** against the running system. It passes on the current code; the last line of its output must be `SECURITY AUDIT PASSED`.

## 1. Fixed before the test

| # | Severity | Issue | Fix |
|---|---|---|---|
| 1 | Critical | **Forged payment confirmation.** With the simulated payment provider, anyone could `POST /api/payments/telebirr/notify` with `{"merch_order_id":…,"trade_status":"Completed"}` and no signature, marking any order as paid. | The public callback only accepts signed telebirr notifications. Simulated notifications are refused (403), and real telebirr ones must include the paid amount, which must match the order. |
| 2 | Critical | **Login as anyone.** The simulated telebirr sign-in accepted `mock-<any phone>` as proof of identity. | Disabled by default (`MOCK_TELEBIRR_SSO=false`) and impossible in production. |
| 3 | High | **Game catalogue open to the internet.** `GET /api/games` and `/api/games/:slug` needed no login. | Both now require a customer login. The website sends visitors to the login page first. |
| 4 | High | **Database reachable from the network.** PostgreSQL listened on `0.0.0.0:5434` with password `telegame`. | Bound to `127.0.0.1` only. |
| 5 | High | **Admin password brute force / account discovery.** Admin login had only per-IP rate limiting, and an unknown email answered faster than a wrong password. | Lockout for 15 minutes after 5 failures per email. The password check always runs, and the message is the same in both cases. |
| 6 | Medium | **Tokens trusted without checking the account.** The role was read from the token, so a deleted or demoted account kept access until expiry. | The user and role are re-read from the database on every request. Only HS256 is accepted (no `alg: none` or algorithm switching). |
| 7 | Medium | **Long admin sessions.** Admin tokens lasted 7 days. | Admin tokens now last 8 hours (`ADMIN_JWT_EXPIRES_IN`). |
| 8 | Medium | **CSV formula injection.** A game title like `=HYPERLINK(…)` ran as a formula when the reconciliation CSV was opened in Excel. | Cells starting with `= + - @` are neutralised. |
| 9 | Medium | **Development shortcuts could reach production.** | With `NODE_ENV=production` the API refuses to start if any of these is on: simulated payments or payouts, `OTP_DEV_ECHO`, `MOCK_TELEBIRR_SSO`, the default admin password, or a `localhost` website address. The login code is never returned or logged in production. |
| 10 | Medium | **Missing browser security headers.** | The website sends a Content-Security-Policy (scripts from this site only, API calls to the teleGame API only, frames from the game supplier only), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` and HSTS, and hides `X-Powered-By`. |
| 11 | Low | The play heartbeat had no rate limit. | 30 per minute (the app sends one every 15 s). |
| 12 | Low | Timing differences in the login-code comparison. | Constant-time comparison. |
| 13 | Low | Large request bodies were accepted. | JSON body limit of 50 KB (larger → 413). CORS allows only the website's origin, methods and headers. |
| 14 | Low | Vulnerable third-party packages (`postcss` inside Next.js, `deepmerge-ts` inside Prisma). | Forced to patched versions. `npm audit --omit=dev` reports 0 vulnerabilities in both projects. |

## 2. Endpoints that are public by design

Every other route (34 of 41) requires a valid login token, and `/api/admin/*` also requires the admin role. These 7 cannot require a customer login, so each has its own protection instead:

| Endpoint | Why it is public | Protection |
|---|---|---|
| `GET /api/health` | Load balancer / monitoring | Returns only `{"status":"ok","service":…}` |
| `POST /api/auth/otp/request` | Login step 1 | 5 per minute per IP; 1 per minute per phone; 6-digit code valid 5 minutes, stored hashed |
| `POST /api/auth/otp/verify` | Login step 2 | 10 per minute per IP; 5 tries per code; one-time use |
| `POST /api/auth/telebirr` | telebirr SuperApp sign-in | The token is verified with telebirr; the simulated version is disabled |
| `POST /api/auth/admin/login` | Admin login | 10 per minute per IP; lockout after 5 failures; 8-hour session |
| `POST /api/payments/telebirr/notify` | telebirr's server-to-server callback | RSA signature check, amount must match, each order paid only once |
| `POST /api/games/:slug/results` | Game supplier's server-to-server results | HMAC-SHA256 per game, 5-minute replay window, one-time result IDs, only for live paid sessions |

## 3. What the automated audit attacks (115 checks)

1. All 41 routes without a token. Everything except the 7 above returns 401.
2. Forged tokens:
   - garbage
   - role changed in the payload
   - `alg: none`
   - guessed secret
   - HS512
   - expired
   - non-existent user
   - missing subject
   - a correctly signed token claiming `ADMIN`
   - a deleted account's token
3. A customer token on all 16 admin routes → 403.
4. IDOR: another customer's orders, checkout page, payment confirmation, game sessions (heartbeat and end), order list and support tickets.
5. Bypasses: forged payment callback, simulated sign-in, wrong or reused login code, unsigned game result.
6. Input attacks:
   - extra fields (mass assignment)
   - negative and over-balance coin conversions
   - text in number fields
   - SQL-injection and path-traversal strings
   - oversized and broken JSON
   - unknown routes (checked for stack-trace leaks)
7. Admin protection: 8-hour session, lockout, no account discovery, game secrets never returned.
8. CSV formula injection.
9. Headers, CORS (including pre-flight), `.env` / `.git` not served, database port local only.
10. Rate limiting of login codes.

## 4. Setting up the environment for the test

Production mode needs real telebirr credentials and an SMS gateway, which are not available yet, so test a development build configured like this in the backend's `.env`:

```
NODE_ENV=development
OTP_DEV_ECHO=false          # codes are not returned by the API; testers read them from the server log
MOCK_TELEBIRR_SSO=false
PAYMENT_PROVIDER=mock       # see risk R1 below
PAYOUT_PROVIDER=manual
ADMIN_PASSWORD=<strong, unique>   # then update the admin account (the seed only sets it on first creation)
JWT_SECRET=<new 64+ random characters>
```

Also change the database password from `telegame` if the test machine is shared.

## 5. Known remaining risks (for the testers to confirm)

| # | Risk | Notes / planned fix |
|---|---|---|
| R1 | **Simulated payments.** With `PAYMENT_PROVIDER=mock`, a logged-in customer can confirm their *own* orders on the simulated checkout page without paying. | Test-only by design; the API refuses this setting in production. Replace with real telebirr before go-live. |
| R2 | Login tokens are kept in browser `localStorage`, so a successful XSS could steal them. | No user-supplied HTML is rendered and the CSP limits scripts. Planned: move to `HttpOnly` cookies. |
| R3 | The CSP allows inline scripts (`'unsafe-inline'`), which Next.js needs. | Planned: nonce-based CSP. |
| R4 | Logout only deletes the token in the browser; a stolen token works until it expires (customers 7 days, admins 8 hours). | Planned: server-side session revocation / shorter customer tokens with refresh. |
| R5 | Rate limits and admin lockout are kept in memory, so they reset when the API restarts and are per server. | Use a shared store (e.g. Redis) when running more than one API instance. |
| R6 | An attacker who knows the admin email can lock the admin out for 15 minutes (lockout as denial of service). | Accepted trade-off; consider IP allow-listing for `/api/admin`. |
| R7 | Login codes are not sent by SMS yet. | Needs Ethio telecom's SMS gateway, or telebirr SuperApp sign-in only. |
| R8 | No HTTPS locally; HSTS only applies over HTTPS. | Serve both apps over HTTPS in every shared environment. |
| R9 | Two development-only packages have advisories with no patched release yet (`braces` in lint tooling, `sprintf-js` in test tooling). | Not part of what is deployed. |
| R10 | Game screens are third-party pages (muen-web.tmofamily.com) shown in a sandboxed frame. | Separate origin; they cannot read the site's storage or tokens. |
| R11 | Admin actions are not written to a full audit log (only coin settings record who changed them). | Planned: audit log of admin changes. |

## 6. How to re-run the checks

With the API (port 4000) and website (port 3000) running and `OTP_DEV_ECHO=true` for the test run:

```
node scripts/security-audit.mjs       # 115 security checks
node scripts/journey-check.mjs        # the 8-step customer journey
node scripts/score-check.mjs          # score-based coins + signature attacks
node scripts/coin-settings-check.mjs  # admin coin settings
```

The audit ends by triggering the login-code rate limit on purpose, so wait one minute before running the other scripts.
