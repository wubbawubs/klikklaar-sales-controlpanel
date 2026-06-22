import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CashPosition {
  id: string;
  org_id: string;
  account: string;
  as_of: string;
  balance: number;
  note: string | null;
  created_at: string;
}

// Balance snapshots for one or more orgs (the all-labels view passes every org id).
export function useCashPositions(orgIds: string[]) {
  return useQuery({
    queryKey: ['cash', [...orgIds].sort()],
    enabled: orgIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_positions')
        .select('*')
        .in('org_id', orgIds)
        .order('as_of', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CashPosition[];
    },
  });
}

// One snapshot per account per date (unique on org_id + account + as_of).
export function useUpsertCash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { org_id: string; account: string; as_of: string; balance: number; note?: string | null }) => {
      const { error } = await supabase
        .from('cash_positions')
        .upsert({
          org_id: row.org_id,
          account: row.account.trim(),
          as_of: row.as_of,
          balance: Number(row.balance) || 0,
          note: row.note?.trim() || null,
        }, { onConflict: 'org_id,account,as_of' });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cash'] }); toast.success('Saldo opgeslagen'); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Opslaan mislukt'),
  });
}

export function useDeleteCash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cash_positions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cash'] }); toast.success('Saldo verwijderd'); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Verwijderen mislukt'),
  });
}
