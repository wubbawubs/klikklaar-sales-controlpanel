import type { Deal } from '@/hooks/usePipeline';
import type { CrmField, Funnel, Stage } from '@/lib/crmTypes';
import { formatEuroCompact, funnelTotals } from '@/lib/dealFields';
import { isClosedStage } from '@/lib/stages';
import { formatTotal } from './funnelFormat';

/** Deals that count as "open": not in a won or lost stage. */
export function openDeals(deals: Deal[], stages: Stage[]): Deal[] {
  const closed = new Set(stages.filter(isClosedStage).map(s => s.id));
  return deals.filter(d => !d.stage_id || !closed.has(d.stage_id));
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="glass shadow-[0_8px_30px_-12px_rgba(30,50,40,0.18),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-none rounded-[14px] px-4 py-3 min-w-0">
      <p className="text-[11.5px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[19px] font-semibold leading-tight tracking-[-0.02em] tabular-nums text-foreground truncate">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{hint}</p>}
    </div>
  );
}

export function KpiTiles({ deals, stages, funnel, fields }: {
  deals: Deal[]; stages: Stage[]; funnel: Funnel; fields: CrmField[];
}) {
  const open = openDeals(deals, stages);
  const t = funnelTotals(open, funnel, fields);
  const amount = formatTotal(t.amount, funnel);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <Tile label="Open deals" value={String(t.count)} />
      {amount && <Tile label={funnel.amount_mode === 'range' ? 'Open, bandbreedte' : 'Open waarde'} value={amount} />}
      {t.weighted && (
        <Tile
          label="Gewogen"
          value={t.weighted.covered > 0 ? formatEuroCompact(t.weighted.value) : '–'}
          hint={`${t.weighted.covered} van ${t.count} deals`}
        />
      )}
    </div>
  );
}
