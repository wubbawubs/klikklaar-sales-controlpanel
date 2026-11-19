import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TONE_HEX, type Tone } from '@/lib/finance/ui';

/** Kleine gekleurde stip, optioneel met tekst erachter. */
export function StatusDot({ tone, children, className }: { tone: Tone; children?: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: TONE_HEX[tone] }} />
      {children}
    </span>
  );
}
