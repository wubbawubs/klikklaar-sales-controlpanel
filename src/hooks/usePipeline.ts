import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/hooks/useOrgId';
import { fireWebhook } from '@/lib/webhooks';
import { toast } from 'sonner';

export interface Stage { id: string; name: string; position: number; color: string }
export interface Deal {
  id: string; org_id: string; stage_id: string | null;
  title: string; value_eur: number | null;
  company_id: string | null; contact_id: string | null;
  billing_type_id: string | null;
  assigned_to: string | null; created_at: string; updated_at: string;
  company?: { name: string } | null;
  contact?: { name: string } | null;
  billing_type?: { name: string; kind: 'one_time' | 'recurring'; interval: 'month' | 'year' | null } | null;
}
export interface Activity {
  id: string; deal_id: string; type: string; body: string | null;
  meta: Record<string, unknown> | null; created_by: string | null; created_at: string;
}

export function useStages() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['stages', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('*')
        .eq('org_id', orgId!)
        .order('position');
      if (error) throw error;
      return (data ?? []) as Stage[];
    },
  });
}

export function useDeals() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['deals', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('*, company:companies(name), contact:contacts(name), billing_type:billing_types(name, kind, interval)')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Deal[];
    },
  });
}

export function useDealActivities(dealId: string) {
  return useQuery({
    queryKey: ['activities', dealId],
    enabled: !!dealId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_activities')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Activity[];
    },
  });
}

export function useMoveDeal() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async ({ dealId, stageId, fromStageName, toStageName }: {
      dealId: string; stageId: string; fromStageName: string; toStageName: string
    }) => {
      const { error } = await supabase
        .from('deals')
        .update({ stage_id: stageId, stage_updated_at: new Date().toISOString() })
        .eq('id', dealId);
      if (error) throw error;
      // Log stage change as activity
      await supabase.from('deal_activities').insert({
        org_id: orgId, deal_id: dealId, type: 'stage_change',
        body: `Verplaatst van "${fromStageName}" naar "${toStageName}"`,
        meta: { from_stage: fromStageName, to_stage: toStageName },
      });
      // Fire webhook to Claude bot
      if (orgId) {
        await fireWebhook(orgId, 'deal.stage_changed', { deal_id: dealId, from_stage: fromStageName, to_stage: toStageName });
        if (toStageName.toLowerCase() === 'won') await fireWebhook(orgId, 'deal.won', { deal_id: dealId });
        if (toStageName.toLowerCase() === 'verloren') await fireWebhook(orgId, 'deal.lost', { deal_id: dealId });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deals', orgId] }),
  });
}

export function useCreateDeal() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async (deal: Partial<Deal> & { title: string; stage_id: string }) => {
      const { error } = await supabase.from('deals').insert({ ...deal, org_id: orgId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals', orgId] });
      toast.success('Deal aangemaakt');
    },
  });
}

// Edit an existing deal's fields (title, value, stage, company, billing type, contact).
export function useUpdateDeal() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<Pick<Deal,
      'title' | 'value_eur' | 'stage_id' | 'company_id' | 'contact_id' | 'billing_type_id'>>) => {
      const { error } = await supabase.from('deals').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['deals', orgId] }); toast.success('Deal bijgewerkt'); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Bijwerken mislukt'),
  });
}

// ---- Billing / fee types (configurable per label) ----
export interface BillingType {
  id: string; org_id: string; name: string;
  kind: 'one_time' | 'recurring'; interval: 'month' | 'year' | null; position: number;
}

const INTERVAL_SUFFIX: Record<string, string> = { month: '/mnd', year: '/jr' };

// "€599/mnd" for recurring, "€2.500" for one-time. type may be undefined.
export function formatFee(value: number | null | undefined, type?: Pick<BillingType, 'kind' | 'interval'> | null): string {
  if (value == null) return '—';
  const amount = `€${Number(value).toLocaleString('nl')}`;
  if (type?.kind === 'recurring' && type.interval) return amount + (INTERVAL_SUFFIX[type.interval] ?? '');
  return amount;
}

export function useBillingTypes() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['billing-types', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('billing_types').select('*').eq('org_id', orgId!).order('position');
      if (error) throw error;
      return (data ?? []) as BillingType[];
    },
  });
}

export function useCreateBillingType() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async ({ name, kind, interval, position }: { name: string; kind: 'one_time' | 'recurring'; interval: 'month' | 'year' | null; position: number }) => {
      const { error } = await supabase.from('billing_types').insert({ org_id: orgId, name, kind, interval, position });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['billing-types', orgId] }); toast.success('Tarieftype toegevoegd'); },
  });
}

export function useDeleteBillingType() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('billing_types').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['billing-types', orgId] }); toast.success('Tarieftype verwijderd'); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Verwijderen mislukt'),
  });
}

export function useCreateStage() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async ({ name, color, position }: { name: string; color: string; position: number }) => {
      const { error } = await supabase.from('pipeline_stages').insert({ org_id: orgId, name, color, position });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stages', orgId] }); toast.success('Stage toegevoegd'); },
  });
}

export function useUpdateStage() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; color?: string; position?: number }) => {
      const { error } = await supabase.from('pipeline_stages').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stages', orgId] }),
  });
}

export function useDeleteStage() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async (id: string) => {
      const { count } = await supabase.from('deals').select('id', { count: 'exact', head: true }).eq('stage_id', id);
      if ((count ?? 0) > 0) throw new Error(`Er staan nog ${count} deals in deze stage — verplaats ze eerst`);
      const { error } = await supabase.from('pipeline_stages').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stages', orgId] }); toast.success('Stage verwijderd'); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Kon stage niet verwijderen'),
  });
}

export interface CompanyLite { id: string; name: string }

export function useCompanies() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['companies', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies').select('id, name').eq('org_id', orgId!).order('name');
      if (error) throw error;
      return (data ?? []) as CompanyLite[];
    },
  });
}

export interface NewLead {
  // company: either an existing id, or a new name to create
  companyId?: string | null;
  companyName?: string;
  contactName?: string;
  email?: string;
  linkedin?: string;
  phone?: string;
  title: string;
  valueEur?: number | null;
  billingTypeId?: string | null;
  stageId: string;
}

// Creates a lead end-to-end: company (if new) + contact (if given) + deal.
export function useCreateLead() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async (lead: NewLead) => {
      let companyId = lead.companyId ?? null;

      if (!companyId && lead.companyName?.trim()) {
        const { data: company, error: ce } = await supabase
          .from('companies').insert({ name: lead.companyName.trim(), email: lead.email || null, org_id: orgId })
          .select('id').single();
        if (ce) throw ce;
        companyId = company.id;
      }

      let contactId: string | null = null;
      if (lead.contactName?.trim() || lead.email?.trim()) {
        const { data: contact, error: ke } = await supabase
          .from('contacts').insert({
            org_id: orgId,
            company_id: companyId,
            name: lead.contactName?.trim() || lead.email?.trim() || 'Onbekend',
            email: lead.email || null,
            phone: lead.phone || null,
            linkedin: lead.linkedin || null,
          }).select('id').single();
        if (ke) throw ke;
        contactId = contact.id;
      }

      const { data: deal, error: de } = await supabase
        .from('deals').insert({
          org_id: orgId,
          title: lead.title.trim(),
          value_eur: lead.valueEur ?? null,
          billing_type_id: lead.billingTypeId ?? null,
          stage_id: lead.stageId,
          company_id: companyId,
          contact_id: contactId,
        }).select('id').single();
      if (de) throw de;

      if (orgId) await fireWebhook(orgId, 'deal.created', { deal_id: deal.id, title: lead.title });
      return deal;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals', orgId] });
      qc.invalidateQueries({ queryKey: ['companies', orgId] });
      toast.success('Lead toegevoegd');
    },
  });
}

export function useAddActivity() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async ({ dealId, type, body }: { dealId: string; type: string; body: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('deal_activities').insert({
        org_id: orgId, deal_id: dealId, type, body, created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['activities', vars.dealId] });
      toast.success('Opgeslagen');
    },
  });
}
