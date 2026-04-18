import { cn } from '@/lib/utils';
import { CheckCircle2, Calendar, Star, Trophy, XCircle, MinusCircle } from 'lucide-react';

export type AttemptOutcome =
  | 'not_reached'
  | 'callback'
  | 'interest'
  | 'appointment'
  | 'deal'
  | 'no_interest'
  | null;

interface AttemptIndicatorProps {
  attempts: number; // count of not_reached attempts
  lastOutcome: AttemptOutcome;
  className?: string;
}

const REACHED_OUTCOMES: Record<string, { icon: any; color: string; label: string }> = {
  callback: { icon: Calendar, color: 'text-orange-400', label: 'Callback' },
  interest: { icon: Star, color: 'text-emerald-400', label: 'Interesse' },
  appointment: { icon: CheckCircle2, color: 'text-green-400', label: 'Afspraak' },
  deal: { icon: Trophy, color: 'text-primary', label: 'Deal' },
  no_interest: { icon: XCircle, color: 'text-red-400', label: 'Geen interesse' },
};

export function AttemptIndicator({ attempts, lastOutcome, className }: AttemptIndicatorProps) {
  // If reached → show coloured icon for the outcome
  if (lastOutcome && lastOutcome !== 'not_reached' && REACHED_OUTCOMES[lastOutcome]) {
    const cfg = REACHED_OUTCOMES[lastOutcome];
    const Icon = cfg.icon;
    return (
      <div className={cn('flex items-center gap-1.5', className)} title={cfg.label}>
        <Icon className={cn('h-4 w-4', cfg.color)} />
        <span className={cn('text-[10px] font-medium', cfg.color)}>{cfg.label}</span>
      </div>
    );
  }

  // Otherwise: 3-dot attempt indicator
  const clamped = Math.min(attempts, 3);
  const cold = attempts >= 3;

  return (
    <div className={cn('flex items-center gap-1.5', className)} title={`${clamped}/3 pogingen`}>
      <div className="flex items-center gap-0.5">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className={cn(
              'h-2 w-2 rounded-full border',
              i < clamped
                ? cold
                  ? 'bg-slate-400 border-slate-400'
                  : 'bg-yellow-400 border-yellow-400'
                : 'bg-transparent border-muted-foreground/40'
            )}
          />
        ))}
      </div>
      {attempts === 0 ? (
        <span className="text-[10px] text-muted-foreground">Nieuw</span>
      ) : cold ? (
        <span className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
          <MinusCircle className="h-3 w-3" /> Cold
        </span>
      ) : (
        <span className="text-[10px] text-muted-foreground">{clamped}/3</span>
      )}
    </div>
  );
}
