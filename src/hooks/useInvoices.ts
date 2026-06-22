import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/hooks/useOrgId';
import { toast } from 'sonner';

export type InvoiceStatus = 'open' | 'paid' | 'overdue';

export interface Invoice {
  id: string;
  org_id: string;
  deal_id: string | null;
  company_id: string | null;
  number: string | null;
  amount: number;
  status: InvoiceStatus;
  description: string | null;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  created_at: string;
  company?: { name: string } | null;
}

// An open invoice past its due date is shown as overdue, without needing a job to
// flip the stored status.
export function displayStatus(inv: Pick<Invoice, 'status' | 'due_at'>): InvoiceStatus {
  if (inv.status === 'open' && inv.due_at && inv.due_at < new Date().toISOString().slice(0, 10)) return 'overdue';
  return inv.status;
}

// Invoices for one or more orgs (the all-labels finance view passes every org id).
export function useInvoices(orgIds: string[]) {
  return useQuery({
    queryKey: ['invoices', [...orgIds].sort()],
    enabled: orgIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, company:companies(name)')
        .in('org_id', orgIds)
        .order('issued_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Invoice[];
    },
  });
}

export interface NewInvoice {
  number?: string;
  amount: number;
  description?: string;
  company_id?: string | null;
  deal_id?: string | null;
  issued_at?: string;
  due_at?: string | null;
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async (inv: NewInvoice) => {
      const { error } = await supabase.from('invoices').insert({
        org_id: orgId,
        number: inv.number?.trim() || null,
        amount: Number(inv.amount) || 0,
        description: inv.description?.trim() || null,
        company_id: inv.company_id ?? null,
        deal_id: inv.deal_id ?? null,
        issued_at: inv.issued_at || new Date().toISOString().slice(0, 10),
        due_at: inv.due_at || null,
        status: 'open',
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); toast.success('Factuur aangemaakt'); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Aanmaken mislukt'),
  });
}

export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<Pick<Invoice, 'status' | 'amount' | 'number' | 'description' | 'due_at' | 'paid_at'>>) => {
      const next: Record<string, unknown> = { ...patch };
      if (patch.status === 'paid' && !patch.paid_at) next.paid_at = new Date().toISOString().slice(0, 10);
      if (patch.status === 'open') next.paid_at = null;
      const { error } = await supabase.from('invoices').update(next).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Bijwerken mislukt'),
  });
}

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('invoices').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); toast.success('Factuur verwijderd'); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Verwijderen mislukt'),
  });
}
