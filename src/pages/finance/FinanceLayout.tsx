import { useMemo } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { FreshnessBadge } from '@/components/finance/FreshnessBadge';
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
    <div className="flex flex-wrap items-center gap-2 pb-2">
      <Select value={companyId} onValueChange={setCompanyId}>
        <SelectTrigger className="h-8 w-[200px]" aria-label="Bedrijf"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle bedrijven</SelectItem>
          {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={mode}
        onValueChange={v => { if (v) setMode(v as 'full' | 'share'); }}
      >
        <ToggleGroupItem value="full">100%</ToggleGroupItem>
        <ToggleGroupItem value="share">aandeel OneGroup</ToggleGroupItem>
      </ToggleGroup>
      <FreshnessBadge syncedAt={oldestSync} />
      {me?.level === 'manage' && (
        <Button size="sm" variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate(undefined)}>
          <RefreshCw className={cn('h-4 w-4 mr-1.5', refresh.isPending && 'animate-spin')} />
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
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-6 pt-4 print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-x-4">
          <h1 className="text-lg font-semibold mb-2">Finance</h1>
          {!empty && <FilterBar />}
        </div>
        <nav className="flex gap-1 overflow-x-auto -mb-px">
          {TABS.map(t => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) => cn(
                'whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 transition-colors',
                isActive
                  ? 'border-primary text-foreground'
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
