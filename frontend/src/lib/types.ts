export type PlanType = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'PAY_PER_USE';
export type OrderStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';
export type PlayMode = 'DEMO' | 'FULL';
export type CoinMode = 'TIME' | 'SCORE';

export interface User {
  id: string;
  phone: string | null;
  name: string | null;
  email: string | null;
  role: 'USER' | 'ADMIN';
  coinBalance: number;
}

export interface Plan {
  id: string;
  type: PlanType;
  priceCents: number;
  durationHours: number | null;
  plays: number | null;
}

export interface Game {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string;
  targetAudience: string;
  themeColor: string;
  /** TIME = coins for verified play time; SCORE = coins for score reported by the game's server */
  coinMode: CoinMode;
  pointsPerCoin: number;
  plans: Plan[];
}

export interface GameAccess {
  hasAccess: boolean;
  subscription: { type: PlanType; expiresAt: string } | null;
  playsRemaining: number;
  demoPlaysLeft: number;
  demoSeconds: number;
}

export interface Order {
  merchOrderId: string;
  status: OrderStatus;
  planType: PlanType;
  amountCents: number;
  game: { slug: string; title: string };
  paidAt: string | null;
  createdAt?: string;
  entitlement?: {
    type: PlanType;
    startsAt: string;
    expiresAt: string | null;
    playsRemaining: number | null;
  } | null;
}

export interface Wallet {
  coinBalance: number;
  etbValueCents: number;
  payoutMsisdn: string | null;
  earnedToday: number;
  rules: {
    coinsPerEtb: number;
    minRedeemCoins: number;
    coinsPerMinute: number;
    maxCoinsPerSession: number;
    maxCoinsPerDay: number;
    instantPayout: boolean;
  };
}

export interface Redemption {
  id: string;
  coins: number;
  amountCents: number;
  msisdn: string;
  status: 'PENDING' | 'PAID' | 'REJECTED';
  payoutRef: string | null;
  note: string | null;
  createdAt: string;
  processedAt: string | null;
}

export interface CoinTx {
  id: string;
  type: 'EARN' | 'REDEEM' | 'REFUND';
  amount: number;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
}
