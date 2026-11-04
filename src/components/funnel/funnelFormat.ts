// Small presentation helpers shared by the funnel board, KPI tiles and list.
import type { Funnel } from '@/lib/crmTypes';
import { formatAmount, formatEuroCompact } from '@/lib/dealFields';

/** A summed amount for a funnel: a range ("€6,75–12,0 mln") or a single value; null for mode none. */
export function formatTotal(amount: { min: number; max: number } | null, funnel: Funnel): string | null {
  if (!amount || funnel.amount_mode === 'none') return null;
  if (funnel.amount_mode === 'fixed') return formatEuroCompact(amount.min);
  return formatAmount({ value_eur: null, value_min_eur: amount.min, value_max_eur: amount.max }, funnel);
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]![0] ?? '' : '';
  return (first + last).toUpperCase();
}

/** Accent-tinted chip: readable (AA) on the white card in daylight, plain accent on dark. */
export const accentChip =
  'bg-primary/[0.13] text-[color-mix(in_srgb,hsl(var(--primary))_62%,black)] dark:bg-primary/20 dark:text-primary';
