import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Check } from 'lucide-react';
import { FreshnessBadge } from '@/components/finance/FreshnessBadge';
import { MoneyInput } from '@/components/finance/MoneyInput';
import { Section } from '@/components/finance/Section';
import { StatusDot } from '@/components/finance/StatusDot';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import {
  useFinanceCompanies, useFinanceMe, useFinanceTargets, useUpdateFinanceCompany, useUpsertTarget,
} from '@/hooks/useFinance';
import { eur } from '@/lib/finance/format';
import type { FinanceCompany } from '@/lib/finance/types';
import { TABLE } from '@/lib/finance/ui';
import { cn } from '@/lib/utils';
import { useFinanceFilter } from './FinanceFilter';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Opslaan mislukt');

function CompanyRow({ c, canManage, isSuper }: { c: FinanceCompany; canManage: boolean; isSuper: boolean }) {
  const update = useUpdateFinanceCompany();
  const [pct, setPct] = useState(String(c.ownership_pct));
  const [buffer, setBuffer] = useState(String(c.min_buffer));
  const [saved, setSaved] = useState(false);
  const dirty = pct !== String(c.ownership_pct) || buffer !== String(c.min_buffer);

  const save = async () => {
    const p = Number(pct);
    const b = Number(buffer);
    if (Number.isNaN(p) || p < 0 || p > 100) return void toast.error('Aandeel moet tussen 0 en 100 liggen');
    if (Number.isNaN(b) || b < 0) return void toast.error('Minimumbuffer moet 0 of meer zijn');
    try {
      // Alleen deze kolommen: een databasetrigger weigert andere wijzigingen door manage-gebruikers.
      await update.mutateAsync({ id: c.id, ownership_pct: p, min_buffer: b });
      setSaved(true);
      toast.success('Opgeslagen');
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const toggleExcluded = async (excluded: boolean) => {
    try {
      await update.mutateAsync({ id: c.id, excluded });
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const dim = c.excluded && 'opacity-60';
  return (
    <tr data-testid={`bedrijf-${c.id}`} className={TABLE.row}>
      <td className={cn(TABLE.td, dim)}>
        <span className="font-medium">{c.name}</span>
        {c.excluded && <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">uitgesloten</span>}
      </td>
      <td className={cn(TABLE.tdNum, dim)}>
        {canManage
          ? <MoneyInput aria-label={`Aandeel % ${c.name}`} suffix="%" wrapperClassName="ml-auto w-24" value={pct} onChange={(e) => { setPct(e.target.value); setSaved(false); }} />
          : `${c.ownership_pct}%`}
      </td>
      <td className={cn(TABLE.tdNum, dim)}>
        {canManage
          ? <MoneyInput aria-label={`Minimumbuffer ${c.name}`} prefix="€" wrapperClassName="ml-auto w-36" value={buffer} onChange={(e) => { setBuffer(e.target.value); setSaved(false); }} />
          : eur(c.min_buffer)}
      </td>
      <td className={cn(TABLE.td, dim)}>
        {c.sync_error
          ? <StatusDot tone="danger" className="text-[13px]">Sync mislukt</StatusDot>
          : <FreshnessBadge syncedAt={c.last_synced_at} />}
        {c.sync_error && <div className="mt-0.5 max-w-[22rem] truncate pl-3.5 text-xs text-muted-foreground" title={c.sync_error}>{c.sync_error}</div>}
      </td>
      <td className={TABLE.td}>
        {isSuper && (
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Switch aria-label={`Uitsluiten ${c.name}`} checked={c.excluded} onCheckedChange={toggleExcluded} />
            Uitsluiten
          </label>
        )}
      </td>
      <td className={cn(TABLE.td, 'w-28 text-right')}>
        {canManage && dirty && (
          <Button size="sm" className="h-8 rounded-md px-3 text-[13px] shadow-none" onClick={save} disabled={update.isPending}>Opslaan</Button>
        )}
        {canManage && !dirty && saved && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />Opgeslagen</span>
        )}
      </td>
    </tr>
  );
}

function TargetsEditor({ companies, year }: { companies: FinanceCompany[]; year: number }) {
  const { companyId } = useFinanceFilter();
  const [picked, setPicked] = useState('');
  const selected = companyId !== 'all' && companies.some((c) => c.id === companyId) ? companyId : picked || companies[0]?.id;
  const targetsQ = useFinanceTargets(year);
  const upsert = useUpsertTarget();
  const [edits, setEdits] = useState<Record<string, string>>({});

  if (!selected) return null;
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const stored = (m: string) => targetsQ.data?.find((t) => t.company_id === selected && t.month === `${m}-01`)?.target;
  const valueOf = (m: string) => edits[`${selected}|${m}`] ?? (stored(m) !== undefined ? String(stored(m)) : '');

  const save = async () => {
    try {
      for (const m of months) {
        const raw = edits[`${selected}|${m}`];
        if (raw === undefined || raw.trim() === '') continue;
        const n = Number(raw);
        if (Number.isNaN(n) || n < 0) throw new Error(`Ongeldig target voor ${m}`);
        await upsert.mutateAsync({ company_id: selected, month: `${m}-01`, target: n });
      }
      setEdits({});
      toast.success('Targets opgeslagen');
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const yearTotal = months.reduce((sum, m) => {
    const n = Number(valueOf(m));
    return valueOf(m).trim() === '' || Number.isNaN(n) ? sum : sum + n;
  }, 0);
  const hasEdits = Object.keys(edits).some((k) => k.startsWith(`${selected}|`));

  return (
    <Section
      title={`Targets ${year}`}
      description="Omzettarget per maand, 100% van het bedrijf."
      actions={companyId === 'all' && (
        <select
          aria-label="Bedrijf voor targets"
          className="h-9 rounded-md border border-input bg-background px-2.5 text-[13px]"
          value={selected}
          onChange={(e) => setPicked(e.target.value)}
        >
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
    >
      <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-12">
        {months.map((m, i) => (
          <label key={m} className="space-y-1">
            <span className="block text-xs font-medium text-muted-foreground">
              {format(new Date(year, i, 1), 'LLL', { locale: nl }).replace('.', '')}
            </span>
            <MoneyInput
              aria-label={`Target ${m}`}
              prefix="€"
              value={valueOf(m)}
              onChange={(e) => setEdits((p) => ({ ...p, [`${selected}|${m}`]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="text-[13px] text-muted-foreground">
          Jaartotaal <span className="ml-1 font-semibold tabular-nums text-foreground">{eur(yearTotal)}</span>
        </div>
        <Button size="sm" className="h-9 rounded-md shadow-none" variant={hasEdits ? 'default' : 'outline'} onClick={save} disabled={upsert.isPending}>Targets opslaan</Button>
      </div>
    </Section>
  );
}

export default function BedrijvenPage() {
  const { month } = useFinanceFilter();
  const year = Number(month.slice(0, 4));
  const meQ = useFinanceMe();
  // RLS verbergt uitgesloten bedrijven voor niet-super_admins.
  const companiesQ = useFinanceCompanies({ includeExcluded: true });
  const [params, setParams] = useSearchParams();

  const isSuper = meQ.data?.is_super_admin === true;
  const canManage = meQ.data?.level === 'manage' || isSuper;

  useEffect(() => {
    const outcome = params.get('exact');
    if (!outcome) return;
    if (outcome === 'connected') toast.success('Exact gekoppeld');
    else if (outcome === 'error') toast.error('Exact koppelen mislukt');
    const next = new URLSearchParams(params);
    next.delete('exact');
    setParams(next, { replace: true });
  }, [params, setParams]);

  const connect = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('exact-auth/start', { method: 'GET' });
      if (error) throw error;
      const url = (data as { url?: string } | null)?.url;
      if (!url) throw new Error('Geen koppel-url ontvangen');
      window.location.assign(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Exact koppelen mislukt');
    }
  };

  if (companiesQ.isLoading) return <div className="p-6 text-sm text-muted-foreground">Laden…</div>;
  const companies = companiesQ.data ?? [];
  return (
    <div className="space-y-6 p-6">
      <Section
        title="Bedrijven"
        description="Aandeel OneGroup, minimumbuffer en de koppeling met Exact per bedrijf."
        actions={isSuper && <Button size="sm" variant="outline" className="h-9 rounded-md shadow-none" onClick={connect}>Exact koppelen</Button>}
        flush
      >
        <table className={TABLE.table}>
          <thead>
            <tr className={TABLE.headRow}>
              <th className={TABLE.th}>Bedrijf</th><th className={TABLE.thNum}>Aandeel</th><th className={TABLE.thNum}>Minimumbuffer</th>
              <th className={TABLE.th}>Sync</th><th className={TABLE.th}><span className="sr-only">Uitsluiten</span></th><th className={TABLE.th}><span className="sr-only">Acties</span></th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => <CompanyRow key={c.id} c={c} canManage={canManage} isSuper={isSuper} />)}
          </tbody>
        </table>
      </Section>
      {canManage && <TargetsEditor companies={companies.filter((c) => !c.excluded)} year={year} />}
    </div>
  );
}
