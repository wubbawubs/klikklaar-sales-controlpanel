import { useEffect, useState } from 'react';
import { fetchAll } from '@/lib/fetch-all';
import { useOrgId } from '@/hooks/useOrgId';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Filter, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  from: Date;
  to: Date;
}

interface Stage {
  label: string;
  value: number;
  pct: number;
  color: string;
}

export default function ConversionFunnel({ from, to }: Props) {
  const [stages, setStages] = useState<Stage[] | null>(null);
  const orgId = useOrgId();

  useEffect(() => {
    const load = async () => {
      const [leads, calls] = await Promise.all([
        fetchAll<any>('lead_assignments', q => {
          let qq = q.select('id, status, created_at, organization_id').gte('created_at', from.toISOString()).lte('created_at', to.toISOString());
          if (orgId) qq = qq.eq('organization_id', orgId);
          return qq;
        }),
        fetchAll<any>('calls', q => {
          let qq = q.select('id, outcome, lead_assignment_id, created_at, organization_id').gte('created_at', from.toISOString()).lte('created_at', to.toISOString());
          if (orgId) qq = qq.eq('organization_id', orgId);
          return qq;
        }),
      ]);

      const totalLeads = leads.length;
      const calledIds = new Set(calls.map(c => c.lead_assignment_id).filter(Boolean));
      const calledLeads = leads.filter(l => calledIds.has(l.id)).length;

      const reachedIds = new Set(
        calls.filter(c => c.outcome && !['not_reached', 'voicemail', 'no_answer'].includes(c.outcome))
          .map(c => c.lead_assignment_id)
          .filter(Boolean)
      );
      const reachedLeads = leads.filter(l => reachedIds.has(l.id)).length;

      const apptCount = calls.filter(c => c.outcome === 'appointment').length;
      const wonCount = leads.filter(l => l.status === 'won').length;

      const max = Math.max(totalLeads, 1);
      const data: Stage[] = [
        { label: 'Leads', value: totalLeads, pct: 100, color: 'bg-primary/80' },
        { label: 'Gebeld', value: calledLeads, pct: (calledLeads / max) * 100, color: 'bg-primary/65' },
        { label: 'Gesprek', value: reachedLeads, pct: (reachedLeads / max) * 100, color: 'bg-info/70' },
        { label: 'Afspraken', value: apptCount, pct: (apptCount / max) * 100, color: 'bg-warning/70' },
        { label: 'Deals gewonnen', value: wonCount, pct: (wonCount / max) * 100, color: 'bg-success/80' },
      ];
      setStages(data);
    };
    load();
  }, [from, to, orgId]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" />
          Conversie funnel
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        {!stages ? (
          <div className="h-[260px] flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3">
            {stages.map((s, i) => {
              const prev = i > 0 ? stages[i - 1].value : s.value;
              const dropPct = prev > 0 ? Math.round((s.value / prev) * 100) : 0;
              return (
                <div key={s.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-foreground">{s.label}</span>
                    <span className="text-muted-foreground tabular-nums">
                      <span className="font-semibold text-foreground">{s.value.toLocaleString('nl-NL')}</span>
                      {i > 0 && <span className="ml-2 text-[10px]">({dropPct}%)</span>}
                    </span>
                  </div>
                  <div className="h-7 bg-muted/40 rounded-md overflow-hidden">
                    <div
                      className={cn('h-full rounded-md transition-all duration-700 ease-out flex items-center justify-end pr-2', s.color)}
                      style={{ width: `${Math.max(s.pct, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
