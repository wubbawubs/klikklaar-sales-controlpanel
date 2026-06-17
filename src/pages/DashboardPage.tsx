import { useNavigate } from 'react-router-dom';
import { KanbanSquare, Layout, Users, TrendingUp, Euro, ArrowRight, Layers } from 'lucide-react';
import { useStages, useDeals } from '@/hooks/usePipeline';
import { useBoards } from '@/hooks/useBoards';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/hooks/useOrgId';
import { useOrganization, type Organization } from '@/hooks/useOrganization';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function useContactCount() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['contact-count', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { count } = await supabase
        .from('contacts').select('id', { count: 'exact', head: true }).eq('org_id', orgId!);
      return count ?? 0;
    },
  });
}

function kpiCard(k: { label: string; value: string | number; icon: typeof Euro; color: string; href: string }, navigate: ReturnType<typeof useNavigate>) {
  return (
    <Card key={k.label} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate(k.href)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{k.label}</p>
          <k.icon className={`h-4 w-4 ${k.color}`} />
        </div>
        <p className="text-2xl font-bold">{k.value}</p>
      </CardContent>
    </Card>
  );
}

// Entry point — route to the group ("Algemeen") dashboard or the single-label one.
export default function DashboardPage() {
  const { isAllView, allOrgIds, available } = useOrganization();
  return isAllView ? <GroupDashboard orgIds={allOrgIds} orgs={available} /> : <SingleDashboard />;
}

// ---- group view: combine every label into one dashboard ---------------------

function useGroupDashboard(orgIds: string[]) {
  return useQuery({
    queryKey: ['group-dashboard', [...orgIds].sort()],
    enabled: orgIds.length > 0,
    queryFn: async () => {
      const [dealsRes, stagesRes, contactsRes] = await Promise.all([
        supabase.from('deals').select('value_eur, org_id, stage_id').in('org_id', orgIds),
        supabase.from('pipeline_stages').select('id, name, org_id').in('org_id', orgIds),
        supabase.from('contacts').select('org_id').in('org_id', orgIds),
      ]);
      const deals = dealsRes.data ?? [];
      const stages = stagesRes.data ?? [];
      const contacts = contactsRes.data ?? [];
      const wonIds = new Set(stages.filter(s => (s.name ?? '').toLowerCase() === 'won').map(s => s.id));
      const isWon = (stageId: string | null) => !!stageId && wonIds.has(stageId);

      const per = new Map<string, { deals: number; value: number; won: number; contacts: number }>();
      for (const id of orgIds) per.set(id, { deals: 0, value: 0, won: 0, contacts: 0 });
      for (const d of deals) {
        const r = per.get(d.org_id); if (!r) continue;
        const v = Number(d.value_eur) || 0;
        r.deals++; r.value += v; if (isWon(d.stage_id)) r.won += v;
      }
      for (const c of contacts) { const r = per.get(c.org_id); if (r) r.contacts++; }

      return {
        totals: {
          deals: deals.length,
          value: deals.reduce((s, d) => s + (Number(d.value_eur) || 0), 0),
          won: deals.filter(d => isWon(d.stage_id)).reduce((s, d) => s + (Number(d.value_eur) || 0), 0),
          contacts: contacts.length,
        },
        perOrg: per,
      };
    },
  });
}

function GroupDashboard({ orgIds, orgs }: { orgIds: string[]; orgs: Organization[] }) {
  const navigate = useNavigate();
  const { switchTo } = useOrganization();
  const { data, isLoading } = useGroupDashboard(orgIds);
  const t = data?.totals;

  const kpis = [
    { label: 'Deals in pipeline', value: t?.deals ?? 0, icon: KanbanSquare, color: 'text-blue-500', href: '/pipeline' },
    { label: 'Totale waarde', value: `€${(t?.value ?? 0).toLocaleString('nl')}`, icon: Euro, color: 'text-emerald-500', href: '/pipeline' },
    { label: 'Gewonnen (€)', value: `€${(t?.won ?? 0).toLocaleString('nl')}`, icon: TrendingUp, color: 'text-green-600', href: '/pipeline' },
    { label: 'Contacten', value: t?.contacts ?? 0, icon: Users, color: 'text-purple-500', href: '/contacts' },
  ];

  const rows = orgIds
    .map(id => ({
      id,
      name: orgs.find(o => o.id === id)?.name ?? id,
      color: orgs.find(o => o.id === id)?.primary_color_hex ?? '#888',
      ...(data?.perOrg.get(id) ?? { deals: 0, value: 0, won: 0, contacts: 0 }),
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Layers className="h-5 w-5 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-semibold">Algemeen — alle labels</h1>
          <p className="text-sm text-muted-foreground">Gecombineerd overzicht over {orgIds.length} labels</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{kpis.map(k => kpiCard(k, navigate))}</div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Per label</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Laden…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground uppercase tracking-wide border-b">
                    <th className="text-left font-medium py-2">Label</th>
                    <th className="text-right font-medium py-2">Deals</th>
                    <th className="text-right font-medium py-2">Waarde</th>
                    <th className="text-right font-medium py-2">Gewonnen</th>
                    <th className="text-right font-medium py-2">Contacten</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr
                      key={r.id}
                      className="border-b last:border-0 hover:bg-muted/40 cursor-pointer"
                      onClick={() => { switchTo(r.id); navigate('/pipeline'); }}
                    >
                      <td className="py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                          <span className="font-medium">{r.name}</span>
                        </span>
                      </td>
                      <td className="text-right tabular-nums">{r.deals}</td>
                      <td className="text-right tabular-nums">€{r.value.toLocaleString('nl')}</td>
                      <td className="text-right tabular-nums text-green-600">€{r.won.toLocaleString('nl')}</td>
                      <td className="text-right tabular-nums">{r.contacts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- single-label view (unchanged behaviour) --------------------------------

function SingleDashboard() {
  const navigate = useNavigate();
  const { data: stages = [] } = useStages();
  const { data: deals = [] } = useDeals();
  const { data: boards = [] } = useBoards();
  const { data: contactCount = 0 } = useContactCount();

  const totalValue = deals.reduce((s, d) => s + (Number(d.value_eur) || 0), 0);
  const wonDeals = deals.filter(d => {
    const stage = stages.find(s => s.id === d.stage_id);
    return stage?.name.toLowerCase() === 'won';
  });
  const wonValue = wonDeals.reduce((s, d) => s + (Number(d.value_eur) || 0), 0);

  const kpis = [
    { label: 'Deals in pipeline', value: deals.length, icon: KanbanSquare, color: 'text-blue-500', href: '/pipeline' },
    { label: 'Totale waarde', value: `€${totalValue.toLocaleString('nl')}`, icon: Euro, color: 'text-emerald-500', href: '/pipeline' },
    { label: 'Gewonnen (€)', value: `€${wonValue.toLocaleString('nl')}`, icon: TrendingUp, color: 'text-green-600', href: '/pipeline' },
    { label: 'Contacten', value: contactCount, icon: Users, color: 'text-purple-500', href: '/contacts' },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overzicht van je pipeline en boards</p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{kpis.map(k => kpiCard(k, navigate))}</div>

      {/* Pipeline per stage */}
      {stages.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Pipeline per fase</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => navigate('/pipeline')}>
                Open <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {stages.map(stage => {
                const count = deals.filter(d => d.stage_id === stage.id).length;
                const value = deals.filter(d => d.stage_id === stage.id).reduce((s, d) => s + (Number(d.value_eur) || 0), 0);
                return (
                  <div key={stage.id} className="flex flex-col items-center min-w-[80px] bg-muted/40 rounded-lg p-2.5 text-center">
                    <span className="h-2 w-2 rounded-full mb-1.5" style={{ backgroundColor: stage.color }} />
                    <p className="text-xs text-muted-foreground truncate w-full text-center">{stage.name}</p>
                    <p className="text-lg font-bold mt-0.5">{count}</p>
                    {value > 0 && <p className="text-[10px] text-muted-foreground">€{value.toLocaleString('nl')}</p>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Boards */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Boards</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => navigate('/boards')}>
              Alle boards <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {boards.length === 0 ? (
            <div className="text-center py-6">
              <Layout className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Geen boards. Maak er een aan voor je roadmap of dev planning.</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => navigate('/boards')}>
                Board aanmaken
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {boards.slice(0, 6).map(b => (
                <button
                  key={b.id}
                  onClick={() => navigate(`/boards/${b.id}`)}
                  className="flex items-center gap-2.5 p-2.5 rounded-lg border hover:border-primary/50 transition-colors text-left"
                >
                  <div className="h-6 w-6 rounded shrink-0 flex items-center justify-center" style={{ backgroundColor: b.color }}>
                    <Layout className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span className="text-sm font-medium truncate">{b.name}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
