export type CloserStatus = 'call' | 'no_show' | 'follow_up' | 'deal' | 'nog_betalen' | 'no_deal';

export const CLOSER_STATUSES: { key: CloserStatus; label: string; tone: string }[] = [
  { key: 'call',        label: 'Bellen',       tone: 'bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-300' },
  { key: 'no_show',     label: 'No show',      tone: 'bg-amber-500/10 text-amber-700 border-amber-200 dark:text-amber-300' },
  { key: 'follow_up',   label: 'Follow-up',    tone: 'bg-purple-500/10 text-purple-700 border-purple-200 dark:text-purple-300' },
  { key: 'deal',        label: 'Deal',         tone: 'bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-300' },
  { key: 'nog_betalen', label: 'Nog betalen',  tone: 'bg-orange-500/10 text-orange-700 border-orange-200 dark:text-orange-300' },
  { key: 'no_deal',     label: 'Geen deal',    tone: 'bg-rose-500/10 text-rose-700 border-rose-200 dark:text-rose-300' },
];

export const CLOSER_STATUS_LABEL: Record<CloserStatus, string> = CLOSER_STATUSES.reduce(
  (acc, s) => ({ ...acc, [s.key]: s.label }),
  {} as Record<CloserStatus, string>
);
