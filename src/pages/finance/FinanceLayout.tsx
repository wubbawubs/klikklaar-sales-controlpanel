import { useMemo } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FreshnessBadge } from '@/components/finance/FreshnessBadge';
import { Segmented } from '@/components/finance/Segmented';
import type { ShareMode } from '@/lib/finance/types';
import { useFinanceCompanies, useFinanceMe, useRefreshExact } from '@/hooks/useFinance';
import { FinanceFilterProvider, useFinanceFilter } from './FinanceFilter';

const TABS = [
  { to: '/finance', label: 'Overzicht', end: true },
  { to: '/finance/omzet', label: 'Omzet & Resultaat' },
  { to: '/finance/liquiditeit', label: 'Cash & Liquiditeit' },
  { to: '/finance/debiteuren', label: 'Facturen & Debiteuren' },
  { to: '/finance/bedrijven', label: 'Bedrijven' },
  { to: '/finance/rapportage', label: 'Rapportage' },
];

function FilterBar() {
  const { companyId, setCompanyId, mode, setMode } = useFinanceFilter();
  const { data: companies = [] } = useFinanceCompanies();
  const { data: me } = useFinanceMe();
  const refresh = useRefreshExact();

  const oldestSync = useMemo(() => {
    const visible = companyId === 'all' ? companies : companies.filter(c => c.id === companyId);
    if (visible.length === 0) return null;
    if (visible.some(c => !c.last_synced_at)) return null;
    return visible.map(c => c.last_synced_at as string).sort()[0];
  }, [companies, companyId]);

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      <Select value={companyId} onValueChange={setCompanyId}>
        <SelectTrigger className="h-9 w-[200px] rounded-md text-[13px]" aria-label="Bedrijf"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle bedrijven</SelectItem>
          {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Segmented<ShareMode>
        label="Weergave"
        value={mode}
        onChange={setMode}
        options={[{ value: 'full', label: '100%' }, { value: 'share', label: 'Aandeel OneGroup' }]}
      />
      <FreshnessBadge syncedAt={oldestSync} className="px-1" />
      {me?.level === 'manage' && (
        <Button size="sm" variant="outline" className="h-9 rounded-md px-3 text-[13px] shadow-none" disabled={refresh.isPending} onClick={() => refresh.mutate(undefined)}>
          <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', refresh.isPending && 'animate-spin')} />
          Nu verversen
        </Button>
      )}
    </div>
  );
}

function Shell() {
  const { data: companies, isLoading } = useFinanceCompanies();
  const empty = !isLoading && (companies?.length ?? 0) === 0;

  return (
    <div>
      <div className="sticky top-0 z-10 border-b bg-background/95 px-6 pt-5 backdrop-blur print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pb-3">
          <h1 className="text-xl font-semibold tracking-tight">Finance</h1>
          {!empty && <FilterBar />}
        </div>
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) => cn(
                'whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>
      {empty
        ? <div className="p-6 text-sm text-muted-foreground">Je hebt nog geen toegang tot bedrijven. Vraag een beheerder om toegang.</div>
        : <Outlet />}
    </div>
  );
}

export default function FinanceLayout() {
  return (
    <FinanceFilterProvider>
      <Shell />
    </FinanceFilterProvider>
  );
}
