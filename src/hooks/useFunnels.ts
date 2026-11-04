import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/hooks/useOrgId';
import type { Funnel, CrmField } from '@/lib/crmTypes';

// CRM tables are not in the generated Supabase types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useFunnels() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['funnels', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await db.from('funnels').select('*')
        .eq('org_id', orgId!).is('archived_at', null).order('position');
      if (error) throw error;
      return (data ?? []) as Funnel[];
    },
  });
}

/** Number of deals in a funnel (head-only count; trashed deals are hidden by RLS). Keyed under 'deals' so deal mutations refresh it. */
export function useFunnelDealCount(funnelId: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['deals', orgId, funnelId, 'count'],
    enabled: !!orgId && !!funnelId,
    queryFn: async () => {
      const { count, error } = await db.from('deals').select('id', { count: 'exact', head: true })
        .eq('org_id', orgId!).eq('funnel_id', funnelId);
      if (error) throw error;
      return (count ?? 0) as number;
    },
  });
}

export function useFunnel(funnelId: string | null | undefined) {
  const { data, ...rest } = useFunnels();
  return { ...rest, data: funnelId ? data?.find(f => f.id === funnelId) : undefined };
}

export function useFunnelFields(funnelId: string | null | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['crm-fields', orgId, 'deal', funnelId],
    enabled: !!orgId && !!funnelId,
    queryFn: async () => {
      const { data, error } = await db.from('crm_fields').select('*')
        .eq('org_id', orgId!).eq('entity', 'deal').eq('funnel_id', funnelId!).order('position');
      if (error) throw error;
      return (data ?? []) as CrmField[];
    },
  });
}

export function useEntityFields(entity: 'company' | 'contact') {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['crm-fields', orgId, entity],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await db.from('crm_fields').select('*')
        .eq('org_id', orgId!).eq('entity', entity).order('position');
      if (error) throw error;
      return (data ?? []) as CrmField[];
    },
  });
}

export interface DealContactRow {
  contact_id: string; role: string | null; is_primary: boolean;
  contact: { name: string; email: string | null; phone: string | null } | null;
}

export function useDealContacts(dealId: string) {
  return useQuery({
    queryKey: ['deal-contacts', dealId],
    enabled: !!dealId,
    queryFn: async () => {
      const { data, error } = await db.from('deal_contacts')
        .select('contact_id, role, is_primary, contact:contacts(name, email, phone)')
        .eq('deal_id', dealId);
      if (error) throw error;
      return (data ?? []) as DealContactRow[];
    },
  });
}

export interface HistoryRow {
  id: string; org_id: string; entity: string; record_id: string; action: string;
  changes: Record<string, unknown> | null; actor: string | null; at: string;
}

export function useDealHistory(dealId: string) {
  return useQuery({
    queryKey: ['deal-history', dealId],
    enabled: !!dealId,
    queryFn: async () => {
      // Task updates only carry the changed columns (no deal_id): match the deal's tasks by record id as well.
      const { data: tasks, error: tErr } = await db.from('crm_tasks').select('id').eq('deal_id', dealId);
      if (tErr) throw tErr;
      const taskIds = ((tasks ?? []) as { id: string }[]).map(t => t.id);
      const byTask = taskIds.length ? `,record_id.in.(${taskIds.join(',')})` : '';
      const { data, error } = await db.from('crm_history').select('*')
        .in('entity', ['deals', 'deal_contacts', 'deal_activities', 'deal_fees', 'crm_tasks'])
        .or(`record_id.eq.${dealId},changes->>deal_id.eq.${dealId}${byTask}`)
        .order('at', { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as HistoryRow[];
    },
  });
}
