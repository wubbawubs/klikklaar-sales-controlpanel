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
  assigned_to: string | null; created_at: string; updated_at: string;
  company?: { name: string } | null;
  contact?: { name: string } | null;
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
        .select('*, company:companies(name), contact:contacts(name)')
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
