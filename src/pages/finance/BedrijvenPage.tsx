import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { FreshnessBadge } from '@/components/finance/FreshnessBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import {
  useFinanceCompanies, useFinanceMe, useFinanceTargets, useUpdateFinanceCompany, useUpsertTarget,
} from '@/hooks/useFinance';
import type { FinanceCompany } from '@/lib/finance/types';
import { useFinanceFilter } from './FinanceFilter';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Opslaan mislukt');

function CompanyRow({ c, canManage, isSuper }: { c: FinanceCompany; canManage: boolean; isSuper: boolean }) {
  const update = useUpdateFinanceCompany();
  const [pct, setPct] = useState(String(c.ownership_pct));
  const [buffer, setBuffer] = useState(String(c.min_buffer));

  const save = async () => {
    const p = Number(pct);
    const b = Number(buffer);
    if (Number.isNaN(p) || p < 0 || p > 100) return void toast.error('Aandeel moet tussen 0 en 100 liggen');
    if (Number.isNaN(b) || b < 0) return void toast.error('Minimumbuffer moet 0 of meer zijn');
    try {
      // Alleen deze kolommen: een databasetrigger weigert andere wijzigingen door manage-gebruikers.
      await update.mutateAsync({ id: c.id, ownership_pct: p, min_buffer: b });
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

  return (
    <tr data-testid={`bedrijf-${c.id}`} className="border-b align-top last:border-0">
      <td className="px-3 py-2">
        {c.name}
        {c.excluded && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">uitgesloten</span>}
      </td>
      <td className="px-3 py-2">
        {canManage
          ? <Input aria-label={`Aandeel % ${c.name}`} type="number" className="w-24" value={pct} onChange={(e) => setPct(e.target.value)} />
          : `${c.ownership_pct}%`}
      </td>
      <td className="px-3 py-2">
        {canManage
          ? <Input aria-label={`Minimumbuffer ${c.name}`} type="number" className="w-32" value={buffer} onChange={(e) => setBuffer(e.target.value)} />
          : c.min_buffer}
      </td>
      <td className="px-3 py-2">
        <FreshnessBadge syncedAt={c.last_synced_at} />
        {c.sync_error && <div className="mt-1 text-xs text-rose-600 dark:text-rose-300">{c.sync_error}</div>}
      </td>
      <td className="px-3 py-2">
        {isSuper && (
          <label className="flex items-center gap-2 text-xs">
            <Switch aria-label={`Uitsluiten ${c.name}`} checked={c.excluded} onCheckedChange={toggleExcluded} />
            Uitsluiten
          </label>
        )}
      </td>
      <td className="px-3 py-2">
        {canManage && <Button size="sm" onClick={save} disabled={update.isPending}>Opslaan</Button>}
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

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Targets {year}</h3>
        {companyId === 'all' && (
          <select
            aria-label="Bedrijf voor targets"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={selected}
            onChange={(e) => setPicked(e.target.value)}
          >
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {months.map((m) => (
          <label key={m} className="space-y-1 text-xs text-muted-foreground">
            {m}
            <Input
              aria-label={`Target ${m}`}
              type="number"
              value={valueOf(m)}
              onChange={(e) => setEdits((p) => ({ ...p, [`${selected}|${m}`]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <Button className="mt-3" size="sm" onClick={save} disabled={upsert.isPending}>Targets opslaan</Button>
    </section>
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
  const th = 'px-3 py-2 font-medium text-muted-foreground';

  return (
    <div className="space-y-6 p-6">
      <section className="overflow-x-auto rounded-xl border bg-card">
        <div className="flex items-center justify-between p-4">
          <h3 className="text-sm font-medium">Bedrijven</h3>
          {isSuper && <Button size="sm" variant="outline" onClick={connect}>Exact koppelen</Button>}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className={th}>Bedrijf</th><th className={th}>Aandeel %</th><th className={th}>Minimumbuffer</th>
              <th className={th}>Sync</th><th className={th} /><th className={th} />
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => <CompanyRow key={c.id} c={c} canManage={canManage} isSuper={isSuper} />)}
          </tbody>
        </table>
      </section>
      {canManage && <TargetsEditor companies={companies.filter((c) => !c.excluded)} year={year} />}
    </div>
  );
}
