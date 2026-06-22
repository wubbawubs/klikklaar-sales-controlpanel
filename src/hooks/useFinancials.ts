import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Financial {
  id: string;
  org_id: string;
  period: string;
  revenue: number;
  costs: number;
  note: string | null;
  created_at: string;
}

// Omzet/resultaat rows for one or more orgs (the all-labels view passes every org id).
export function useFinancials(orgIds: string[]) {
  return useQuery({
    queryKey: ['financials', [...orgIds].sort()],
    enabled: orgIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_financials')
        .select('*')
        .in('org_id', orgIds)
        .order('period', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Financial[];
    },
  });
}

// Insert or update a period for a label (unique on org_id + period).
export function useUpsertFinancial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { org_id: string; period: string; revenue: number; costs: number; note?: string | null }) => {
      const { error } = await supabase
        .from('company_financials')
        .upsert({
          org_id: row.org_id,
          period: row.period.trim(),
          revenue: Number(row.revenue) || 0,
          costs: Number(row.costs) || 0,
          note: row.note?.trim() || null,
        }, { onConflict: 'org_id,period' });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['financials'] }); toast.success('Periode opgeslagen'); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Opslaan mislukt'),
  });
}

export function useDeleteFinancial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('company_financials').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['financials'] }); toast.success('Periode verwijderd'); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Verwijderen mislukt'),
  });
}
