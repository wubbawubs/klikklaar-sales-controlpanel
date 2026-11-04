import { forwardRef, type HTMLAttributes } from 'react';
import { CalendarClock, Phone } from 'lucide-react';
import type { Deal } from '@/hooks/usePipeline';
import type { Appointment } from '@/hooks/useAppointments';
import type { CrmField, Funnel } from '@/lib/crmTypes';
import { dealDisplayValue, displayValue, formatAmount, visibleFields } from '@/lib/dealFields';
import { cn } from '@/lib/utils';
import { accentChip, initials } from './funnelFormat';

export interface DealCardProps extends HTMLAttributes<HTMLDivElement> {
  deal: Deal;
  funnel: Funnel;
  fields: CrmField[];
  ownerName?: string | null;
  next?: Appointment;
  dragging?: boolean;
}

const fmtNext = (iso: string) =>
  new Date(iso).toLocaleString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const DealCard = forwardRef<HTMLDivElement, DealCardProps>(function DealCard(
  { deal, funnel, fields, ownerName, next, dragging, className, ...rest }, ref,
) {
  const shown = visibleFields(fields);
  const on = (key: string) => shown.find(f => f.key === key);

  const countryF = on('country');
  const subtitle = [deal.company?.name, countryF ? displayValue(countryF, deal.country) : null]
    .filter(Boolean).join(', ');

  const amount = on('amount') ? formatAmount(deal, funnel) : null;

  const chanceF = on('win_chance');
  const chance = chanceF && typeof deal.win_chance === 'number' ? Math.max(0, Math.min(100, deal.win_chance)) : null;

  const prioF = on('priority');
  const priority = prioF ? dealDisplayValue(deal, prioF) : null;

  const overdue = next ? new Date(next.starts_at) < new Date() : false;
  const hasFooter = !!priority || !!next || !!ownerName;

  return (
    <div
      ref={ref}
      {...rest}
      className={cn(
        'group/card rounded-xl border px-3 py-[11px] cursor-pointer select-none text-left',
        'bg-white/[0.78] border-white/90 shadow-[0_2px_8px_-2px_rgba(30,50,40,0.10)]',
        'transition-[box-shadow,transform,border-color] duration-150 motion-reduce:transition-none',
        'hover:shadow-[0_8px_22px_-8px_rgba(30,50,40,0.22)] hover:border-white',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'dark:bg-card/80 dark:border-border/60',
        'supports-[not((backdrop-filter:blur(1px))_or_(-webkit-backdrop-filter:blur(1px)))]:bg-white',
        dragging && 'rotate-[1.5deg] shadow-[0_16px_36px_-10px_rgba(30,50,40,0.35)] motion-reduce:rotate-0',
        className,
      )}
    >
      <p className="text-[13px] font-semibold leading-snug tracking-[-0.005em] text-foreground line-clamp-2 break-words">
        {deal.title}
      </p>
      {subtitle && <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground truncate">{subtitle}</p>}

      {(amount || chance !== null) && (
        <div className="mt-2.5 flex items-center justify-between gap-2">
          {amount
            ? <span className="text-[13px] font-semibold tabular-nums tracking-[-0.01em] text-foreground">{amount}</span>
            : <span />}
          {chance !== null && (
            <span className={cn('rounded-full px-[7px] py-[2px] text-[10.5px] font-semibold tabular-nums', accentChip)}>
              {chance}%
            </span>
          )}
        </div>
      )}
      {chance !== null && (
        <div
          role="progressbar"
          aria-label="Winkans"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={chance}
          className="mt-2 h-[5px] overflow-hidden rounded-[3px] bg-black/[0.07] dark:bg-white/10"
        >
          <div className="h-full rounded-[3px] bg-primary" style={{ width: `${chance}%` }} />
        </div>
      )}

      {hasFooter && (
        <div className="mt-2.5 flex items-center gap-1.5 min-w-0">
          {priority && (
            <span className="shrink-0 rounded-full bg-black/[0.05] px-[7px] py-[2px] text-[10.5px] font-medium text-foreground/80 dark:bg-white/10">
              {priority}
            </span>
          )}
          {next && (
            <span
              className={cn(
                'inline-flex min-w-0 items-center gap-1 text-[11px] font-medium',
                overdue ? 'text-destructive' : 'text-[color-mix(in_srgb,hsl(var(--primary))_62%,black)] dark:text-primary',
              )}
              title={overdue ? 'Afspraak is verlopen' : 'Volgende afspraak'}
            >
              {next.type === 'call' ? <Phone className="h-3 w-3 shrink-0" /> : <CalendarClock className="h-3 w-3 shrink-0" />}
              <span className="truncate">{fmtNext(next.starts_at)}</span>
            </span>
          )}
          {ownerName && (
            <span
              className="ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white
                bg-[linear-gradient(135deg,hsl(var(--primary)),color-mix(in_srgb,hsl(var(--primary))_55%,black))]
                shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
              title={ownerName}
              aria-label={`Eigenaar: ${ownerName}`}
            >
              {initials(ownerName)}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
