import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CoinRules } from '../common/coins';

/** Typed access to the business rules defined in the proposal (see .env.example). */
@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService) {}

  private str(key: string, fallback?: string): string {
    const v = this.config.get<string>(key);
    if (v === undefined || v === '') {
      if (fallback !== undefined) return fallback;
      throw new Error(`Missing required environment variable ${key}`);
    }
    return v;
  }

  private num(key: string, fallback: number): number {
    const raw = this.config.get<string>(key);
    if (raw === undefined || raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n))
      throw new Error(`Environment variable ${key} must be a number`);
    return n;
  }

  private bool(key: string, fallback: boolean): boolean {
    const raw = this.config.get<string>(key);
    if (raw === undefined || raw === '') return fallback;
    return raw.toLowerCase() === 'true';
  }

  get port() {
    return this.num('PORT', 4000);
  }
  get frontendUrl() {
    return this.str('FRONTEND_URL', 'http://localhost:3000');
  }
  get publicApiUrl() {
    return this.str('PUBLIC_API_URL', 'http://localhost:4000');
  }
  get jwtSecret() {
    return this.str('JWT_SECRET');
  }
  get jwtExpiresIn() {
    return this.str('JWT_EXPIRES_IN', '7d');
  }
  get otpDevEcho() {
    return this.bool('OTP_DEV_ECHO', false);
  }

  get revenue() {
    return {
      pricesIncludeVat: this.bool('PRICES_INCLUDE_VAT', true),
      vatRate: this.num('VAT_RATE', 0.15),
      otherTaxRate: this.num('OTHER_TAX_RATE', 0),
      partnerShare: this.num('PARTNER_SHARE', 0.7),
    };
  }

  get demo() {
    return {
      playsPerDay: this.num('DEMO_PLAYS_PER_DAY', 3),
      seconds: this.num('DEMO_SECONDS', 180),
    };
  }

  /** Initial coin rules only; admins change them later in Coin settings (CoinSettingsService). */
  get defaultCoinRules(): CoinRules {
    return {
      coinsPerInterval: this.num('COINS_PER_MINUTE', 2),
      intervalMinutes: 1,
      maxPerSession: this.num('MAX_COINS_PER_SESSION', 60),
      maxPerDay: this.num('MAX_COINS_PER_DAY', 200),
      perEtb: this.num('COINS_PER_ETB', 100),
      minRedeem: this.num('MIN_REDEEM_COINS', 100),
    };
  }

  get paymentProvider(): 'mock' | 'telebirr' {
    const p = this.str('PAYMENT_PROVIDER', 'mock');
    if (p !== 'mock' && p !== 'telebirr')
      throw new Error('PAYMENT_PROVIDER must be mock or telebirr');
    return p;
  }

  get payoutProvider(): 'mock' | 'manual' {
    const p = this.str('PAYOUT_PROVIDER', 'mock');
    if (p !== 'mock' && p !== 'manual')
      throw new Error('PAYOUT_PROVIDER must be mock or manual');
    return p;
  }

  get telebirr() {
    const pem = (k: string) => this.str(k).replace(/\\n/g, '\n');
    return {
      baseUrl: this.str('TELEBIRR_BASE_URL'),
      webBaseUrl: this.str('TELEBIRR_WEB_BASE_URL'),
      fabricAppId: this.str('TELEBIRR_FABRIC_APP_ID'),
      appSecret: this.str('TELEBIRR_APP_SECRET'),
      merchantAppId: this.str('TELEBIRR_MERCHANT_APP_ID'),
      shortCode: this.str('TELEBIRR_SHORT_CODE'),
      privateKey: pem('TELEBIRR_PRIVATE_KEY'),
      publicKey: pem('TELEBIRR_PUBLIC_KEY'),
    };
  }
}
