import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type {
  BankAccount, FinanceCompany, FixedCost, MonthlyRow, OpenItem, SupplierSpend, Target,
} from '@/lib/finance/types';

export interface FinanceMe {
  has_access: boolean;
  level: 'view' | 'manage' | null;
  is_super_admin: boolean;
}

const NO_ACCESS: FinanceMe = { has_access: false, level: null, is_super_admin: false };

export function useFinanceMe() {
  return useQuery({
    queryKey: ['finance', 'me'],
    queryFn: async (): Promise<FinanceMe> => {
      const { data, error } = await supabase.rpc('finance_me');
      if (error) throw error;
      const row = (data as unknown as FinanceMe[] | null)?.[0];
      return row ?? NO_ACCESS;
    },
    staleTime: 60_000,
  });
}

export function useFinanceCompanies({ includeExcluded = false }: { includeExcluded?: boolean } = {}) {
  return useQuery({
    queryKey: ['finance', 'companies', { includeExcluded }],
    queryFn: async (): Promise<FinanceCompany[]> => {
      let q = supabase.from('finance_companies').select('*');
      if (!includeExcluded) q = q.eq('excluded', false);
      const { data, error } = await q.order('name');
      if (error) throw error;
      return (data ?? []) as FinanceCompany[];
    },
  });
}

export function useFinanceMonthly(years: number[]) {
  const sorted = [...years].sort((a, b) => a - b);
  return useQuery({
    queryKey: ['finance', 'monthly', sorted],
    enabled: sorted.length > 0,
    queryFn: async (): Promise<MonthlyRow[]> => {
      const { data, error } = await supabase
        .from('finance_monthly')
        .select('*')
        .gte('month', `${sorted[0]}-01-01`)
        .lte('month', `${sorted[sorted.length - 1]}-12-01`)
        .order('month');
      if (error) throw error;
      return (data ?? []) as MonthlyRow[];
    },
  });
}

export function useFinanceBank() {
  return useQuery({
    queryKey: ['finance', 'bank'],
    queryFn: async (): Promise<BankAccount[]> => {
      const { data, error } = await supabase.from('finance_bank_accounts').select('*').order('name');
      if (error) throw error;
      return (data ?? []) as BankAccount[];
    },
  });
}

export function useFinanceOpenItems(kind: 'receivable' | 'payable') {
  return useQuery({
    queryKey: ['finance', 'open-items', kind],
    queryFn: async (): Promise<OpenItem[]> => {
      const { data, error } = await supabase
        .from('finance_open_items')
        .select('*')
        .eq('kind', kind)
        .order('due_date');
      if (error) throw error;
      return (data ?? []) as OpenItem[];
    },
  });
}

export function useFinanceTargets(year: number) {
  return useQuery({
    queryKey: ['finance', 'targets', year],
    queryFn: async (): Promise<Target[]> => {
      const { data, error } = await supabase
        .from('finance_targets')
        .select('*')
        .gte('month', `${year}-01-01`)
        .lte('month', `${year}-12-01`)
        .order('month');
      if (error) throw error;
      return (data ?? []) as Target[];
    },
  });
}

export function useFinanceFixedCosts() {
  return useQuery({
    queryKey: ['finance', 'fixed-costs'],
    queryFn: async (): Promise<FixedCost[]> => {
      const { data, error } = await supabase.from('finance_fixed_costs').select('*').order('name');
      if (error) throw error;
      return (data ?? []) as FixedCost[];
    },
  });
}

export function useFinanceSupplierSpend() {
  return useQuery({
    queryKey: ['finance', 'supplier-spend'],
    queryFn: async (): Promise<SupplierSpend[]> => {
      const { data, error } = await supabase.from('finance_supplier_spend').select('*').order('supplier_name');
      if (error) throw error;
      return (data ?? []) as SupplierSpend[];
    },
  });
}

export function useUpdateFinanceCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<Pick<FinanceCompany, 'ownership_pct' | 'min_buffer' | 'excluded' | 'name'>>) => {
      const { error } = await supabase.from('finance_companies').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance'] }),
  });
}

export function useUpsertTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: Target) => {
      const { error } = await supabase.from('finance_targets').upsert(t, { onConflict: 'company_id,month' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance', 'targets'] }),
  });
}

export type FixedCostInput = Partial<Pick<FixedCost, 'id' | 'exact_supplier_code' | 'active'>> &
  Pick<FixedCost, 'company_id' | 'name' | 'category' | 'monthly_amount'>;

export function useSaveFixedCost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: FixedCostInput) => {
      const { error } = c.id
        ? await supabase.from('finance_fixed_costs').update(c).eq('id', c.id)
        : await supabase.from('finance_fixed_costs').insert(c);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance', 'fixed-costs'] }),
  });
}

export interface ExactSyncResult { synced: number; failed: number; remaining: number }

export function useRefreshExact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (companyId?: string): Promise<ExactSyncResult> => {
      const { data, error } = await supabase.functions.invoke('exact-sync', {
        body: companyId ? { companyId } : {},
      });
      if (error) throw error;
      return data as ExactSyncResult;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['finance'] });
      if (r?.failed) toast.error(`${r.failed} bedrijf(ven) konden niet worden bijgewerkt.`);
      else if (r?.remaining) toast.success('Gedeeltelijk bijgewerkt; ververs nogmaals voor de rest.');
      else toast.success('Exact bijgewerkt.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Verversen mislukt'),
  });
}

export interface FinanceAccessRow { user_id: string; level: 'view' | 'manage' }
export interface FinanceCompanyAccessRow { user_id: string; company_id: string }

/** Beheer: alle toegangsrijen (RLS laat alleen super_admin dit zien/schrijven). */
export function useFinanceAccessAll() {
  return useQuery({
    queryKey: ['finance', 'access-admin'],
    queryFn: async () => {
      const [a, c] = await Promise.all([
        supabase.from('finance_access').select('user_id, level'),
        supabase.from('finance_company_access').select('user_id, company_id'),
      ]);
      if (a.error) throw a.error;
      if (c.error) throw c.error;
      return {
        access: (a.data ?? []) as FinanceAccessRow[],
        companyAccess: (c.data ?? []) as FinanceCompanyAccessRow[],
      };
    },
  });
}

/** 'none' verwijdert finance_access en alle finance_company_access-rijen van de gebruiker. */
export function useSetFinanceLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, level }: { userId: string; level: 'none' | 'view' | 'manage' }) => {
      if (level === 'none') {
        const c = await supabase.from('finance_company_access').delete().eq('user_id', userId);
        if (c.error) throw c.error;
        const a = await supabase.from('finance_access').delete().eq('user_id', userId);
        if (a.error) throw a.error;
      } else {
        const { error } = await supabase.from('finance_access').upsert({ user_id: userId, level }, { onConflict: 'user_id' });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance'] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Opslaan mislukt'),
  });
}

export function useSetCompanyAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, companyId, enabled }: { userId: string; companyId: string; enabled: boolean }) => {
      const { error } = enabled
        ? await supabase.from('finance_company_access').insert({ user_id: userId, company_id: companyId })
        : await supabase.from('finance_company_access').delete().eq('user_id', userId).eq('company_id', companyId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance'] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Opslaan mislukt'),
  });
}
