import { etb } from '@/lib/format';

/** "3 ETB" when all listed games share a price, otherwise "from 2 ETB". */
export function planPriceLabel(prices: number[]) {
  if (prices.length === 0) return '—';
  const min = Math.min(...prices);
  const whole = (c: number) => etb(c).replace('.00 ', ' ');
  return prices.every((p) => p === min) ? whole(min) : `from ${whole(min)}`;
}
