import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TONE_CHIP, TONE_TEXT, type Tone } from '@/lib/finance/ui';

export interface KpiItem {
  label: string;
  value: ReactNode;
  /** Contextregel onder de waarde: tekst, een Chip, of beide. */
  context?: ReactNode;
  valueTone?: Tone;
}

/**
 * Eén breed paneel met de kerncijfers, gescheiden door dunne lijnen.
 * Op smalle schermen gestapeld met horizontale lijnen.
 */
export function KpiStrip({ items }: { items: KpiItem[] }) {
  return (
    <div
      className={cn(
        'grid divide-y rounded-xl border bg-card shadow-sm lg:divide-x lg:divide-y-0',
        items.length === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4',
      )}
    >
      {items.map((k) => (
        <div key={k.label} className="min-w-0 px-5 py-4">
          <div className="text-[12.5px] font-medium text-muted-foreground">{k.label}</div>
          <div
            className={cn(
              'mt-1.5 truncate text-[28px] font-semibold leading-9 tracking-tight tabular-nums',
              k.valueTone ? TONE_TEXT[k.valueTone] : 'text-foreground',
            )}
          >
            {k.value}
          </div>
          {k.context && <div className="mt-1.5 flex min-h-[22px] flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{k.context}</div>}
        </div>
      ))}
    </div>
  );
}

/** Kleine gekleurde chip, bv. "+12%" of "108%". */
export function Chip({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums', TONE_CHIP[tone], className)}>
      {children}
    </span>
  );
}
