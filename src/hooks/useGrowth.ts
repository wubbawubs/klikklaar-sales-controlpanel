import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/hooks/useOrgId';
import { toast } from 'sonner';

export type GoalMetric = 'revenue' | 'deals_won' | 'leads_added';

export interface GrowthGoal {
  id: string;
  org_id: string;
  name: string;
  metric: GoalMetric;
  target_value: number;
  period_start: string;
  period_end: string;
  created_at: string;
}

export interface GoalWithProgress extends GrowthGoal {
  current: number;
  pct: number;
}

export const METRIC_LABELS: Record<GoalMetric, string> = {
  revenue: 'Omzet (€)',
  deals_won: 'Deals gewonnen',
  leads_added: 'Leads toegevoegd',
};

export function useGrowthGoals() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['growth-goals', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<GoalWithProgress[]> => {
      const { data: goals, error } = await supabase
        .from('growth_goals').select('*').eq('org_id', orgId!).order('period_end', { ascending: false });
      if (error) throw error;

      // Pull the deal facts once and compute each goal's progress client-side.
      const { data: deals } = await supabase
        .from('deals').select('value_eur, won_at, created_at').eq('org_id', orgId!);
      const rows = deals ?? [];

      return (goals ?? []).map((g: GrowthGoal) => {
        const start = new Date(g.period_start).getTime();
        const end = new Date(g.period_end).getTime() + 86_400_000; // inclusive end day
        let current = 0;
        for (const d of rows) {
          const won = d.won_at ? new Date(d.won_at).getTime() : null;
          const created = d.created_at ? new Date(d.created_at).getTime() : null;
          if (g.metric === 'revenue' && won && won >= start && won < end) current += Number(d.value_eur) || 0;
          else if (g.metric === 'deals_won' && won && won >= start && won < end) current += 1;
          else if (g.metric === 'leads_added' && created && created >= start && created < end) current += 1;
        }
        const pct = g.target_value > 0 ? Math.min(100, Math.round((current / Number(g.target_value)) * 100)) : 0;
        return { ...g, current, pct };
      });
    },
  });
}

export function useCreateGoal() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async (input: { name: string; metric: GoalMetric; target_value: number; period_start: string; period_end: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('growth_goals').insert({ ...input, org_id: orgId, created_by: user?.id });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['growth-goals', orgId] }); toast.success('Doel toegevoegd'); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Kon doel niet toevoegen'),
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('growth_goals').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['growth-goals', orgId] }); toast.success('Doel verwijderd'); },
  });
}
