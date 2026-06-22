import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type ContractKind = 'one_time' | 'recurring';
export type ContractStatus = 'active' | 'ended' | 'draft';

export interface Contract {
  id: string;
  org_id: string;
  company_id: string | null;
  title: string;
  value: number;
  kind: ContractKind;
  interval: 'month' | 'year' | null;
  start_date: string | null;
  end_date: string | null;
  status: ContractStatus;
  note: string | null;
  created_at: string;
  company?: { name: string } | null;
}

// Monthly-normalised value of an active recurring contract (for MRR).
export function monthlyValue(c: Pick<Contract, 'kind' | 'interval' | 'value' | 'status'>): number {
  if (c.status !== 'active' || c.kind !== 'recurring') return 0;
  return c.interval === 'year' ? Number(c.value) / 12 : Number(c.value);
}

export function useContracts(orgIds: string[]) {
  return useQuery({
    queryKey: ['contracts', [...orgIds].sort()],
    enabled: orgIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('*, company:companies(name)')
        .in('org_id', orgIds)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Contract[];
    },
  });
}

export interface ContractInput {
  org_id: string;
  company_id?: string | null;
  title: string;
  value: number;
  kind: ContractKind;
  interval?: 'month' | 'year' | null;
  start_date?: string | null;
  end_date?: string | null;
  status: ContractStatus;
  note?: string | null;
}

export function useSaveContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...c }: ContractInput & { id?: string }) => {
      const row = {
        org_id: c.org_id,
        company_id: c.company_id ?? null,
        title: c.title.trim(),
        value: Number(c.value) || 0,
        kind: c.kind,
        interval: c.kind === 'recurring' ? (c.interval || 'month') : null,
        start_date: c.start_date || null,
        end_date: c.end_date || null,
        status: c.status,
        note: c.note?.trim() || null,
      };
      const q = id
        ? supabase.from('contracts').update(row).eq('id', id)
        : supabase.from('contracts').insert(row);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contracts'] }); toast.success('Contract opgeslagen'); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Opslaan mislukt'),
  });
}

export function useDeleteContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contracts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contracts'] }); toast.success('Contract verwijderd'); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Verwijderen mislukt'),
  });
}
