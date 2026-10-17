import type { CoinMode, PlanType } from './types';

/** One-line explanation of how a game pays coins. */
export const coinRuleText = (mode: CoinMode, pointsPerCoin: number) =>
  mode === 'SCORE'
    ? `Earn 1 coin for every ${pointsPerCoin.toLocaleString()} points you score.`
    : 'Earn coins for every minute you play.';

export const etb = (cents: number) =>
  `${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;

export const PLAN_LABEL: Record<PlanType, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  PAY_PER_USE: 'Pay per play',
};

export const PLAN_PERIOD: Record<PlanType, string> = {
  DAILY: '24 hours of unlimited play',
  WEEKLY: '7 days of unlimited play',
  MONTHLY: '30 days of unlimited play',
  PAY_PER_USE: 'One game session',
};

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Addis_Ababa',
  });

/** 251911223344 -> "0911 223 344" */
export const displayPhone = (msisdn: string | null) => {
  if (!msisdn) return '';
  const local = msisdn.replace(/^251/, '');
  return `0${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
};

export const mmss = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
