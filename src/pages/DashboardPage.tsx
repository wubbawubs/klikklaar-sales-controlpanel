import { useNavigate } from 'react-router-dom';
import { KanbanSquare, Layout, Users, TrendingUp, Euro, ArrowRight } from 'lucide-react';
import { useStages, useDeals } from '@/hooks/usePipeline';
import { useBoards } from '@/hooks/useBoards';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/hooks/useOrgId';
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

export default function DashboardPage() {
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(k => (
          <Card key={k.label} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate(k.href)}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{k.label}</p>
                <k.icon className={`h-4 w-4 ${k.color}`} />
              </div>
              <p className="text-2xl font-bold">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

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
