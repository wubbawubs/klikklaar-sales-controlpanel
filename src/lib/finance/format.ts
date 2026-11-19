import { differenceInHours, formatDistance } from 'date-fns';
import { nl } from 'date-fns/locale';

const STALE_HOURS = 26;

const formatters = {
  0: new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  2: new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};

/** € 1.234 (geen decimalen) of € 1.234,50; null wordt "—". */
export function eur(n: number | null, opts: { decimals?: 0 | 2 } = {}): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  // Intl gebruikt een niet-brekende spatie na het €-teken; normaliseer naar gewone spatie.
  return formatters[opts.decimals ?? 0].format(n).replace(/ /g, ' ');
}

export function freshness(syncedAt: string | null, now: Date): { label: string; stale: boolean } {
  if (!syncedAt) return { label: 'Nog niet gesynchroniseerd', stale: true };
  const date = new Date(syncedAt);
  if (Number.isNaN(date.getTime())) return { label: 'Onbekend', stale: true };
  return {
    label: `Bijgewerkt ${formatDistance(date, now, { locale: nl, addSuffix: true })}`.replace(/\s+/g, ' '),
    stale: differenceInHours(now, date) > STALE_HOURS,
  };
}
