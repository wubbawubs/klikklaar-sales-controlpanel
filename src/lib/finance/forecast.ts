import { addWeeks, format, parseISO, startOfWeek } from 'date-fns';
import type { FixedCost, OpenItem } from './types';

export interface ForecastWeek {
  weekStart: string;
  balance: number;
  inflow: number;
  outflow: number;
}

const WEEKS = 13;
const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

/**
 * 13-wekenprognose met maandag als weekstart. Debiteuren zijn inflow, crediteuren
 * outflow; achterstallige posten (en posten zonder vervaldatum) vallen in week 1.
 * Actieve vaste lasten tellen per week mee als monthly_amount * 12 / 52.
 */
export function forecast13Weeks(input: {
  startBalance: number;
  items: OpenItem[];
  fixedCosts: FixedCost[];
  today: string;
}): ForecastWeek[] {
  const first = startOfWeek(parseISO(input.today), { weekStartsOn: 1 });
  const starts = Array.from({ length: WEEKS }, (_, i) => fmt(addWeeks(first, i)));
  const weeklyFixed = input.fixedCosts.filter((f) => f.active).reduce((s, f) => s + (f.monthly_amount * 12) / 52, 0);

  const inflow = new Array<number>(WEEKS).fill(0);
  const outflow = starts.map(() => weeklyFixed);

  for (const item of input.items) {
    if (item.kind !== 'receivable' && item.kind !== 'payable') continue;
    let idx = 0;
    if (item.due_date) {
      // Laatste week waarvan de start <= vervaldatum; ISO-datums vergelijken als string.
      idx = starts.findLastIndex((s) => s <= item.due_date!);
      if (idx < 0) idx = 0; // te laat: week 1
      else if (idx === WEEKS - 1 && item.due_date >= fmt(addWeeks(first, WEEKS))) continue; // voorbij horizon
    }
    if (item.kind === 'receivable') inflow[idx] += item.amount;
    else outflow[idx] += item.amount;
  }

  let balance = input.startBalance;
  return starts.map((weekStart, i) => {
    balance += inflow[i] - outflow[i];
    return { weekStart, balance, inflow: inflow[i], outflow: outflow[i] };
  });
}
