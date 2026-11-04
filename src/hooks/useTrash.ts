import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/hooks/useOrgId';
import { useAuth } from '@/hooks/useAuth';
import { errorMessage } from '@/lib/errors';
import type { TrashEntity, TrashItem } from '@/lib/crmTypes';
import { toast } from 'sonner';

// The trash RPCs are not in the generated Supabase types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Trashed items of the active organisation: one row per delete batch (the item the user deleted). */
export function useTrash() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['trash', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await db.rpc('crm_trash_list', { p_org: orgId });
      if (error) throw error;
      return (data ?? []) as TrashItem[];
    },
  });
}

/** Whether the current user may purge in the active organisation (global admin, or org admin/owner). */
export function useIsOrgAdmin() {
  const orgId = useOrgId();
  const { user } = useAuth();
  return useQuery({
    queryKey: ['is-org-admin', user?.id, orgId],
    enabled: !!orgId && !!user?.id,
    queryFn: async () => {
      const { data, error } = await db.rpc('is_org_admin', { _user: user!.id, _org: orgId });
      if (error) throw error;
      return data === true;
    },
  });
}

// Restored/purged rows can show up in any CRM list, dashboard or count: refresh everything (rare action).
const refreshCrm = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries();

export function useRestoreBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (batch: string) => {
      const { data, error } = await db.rpc('crm_restore', { p_batch: batch });
      if (error) throw error;
      return (data ?? 0) as number;
    },
    meta: { silent: true },
    onSuccess: () => { refreshCrm(qc); toast.success('Teruggezet'); },
    // e.g. 'Dit item staat in de prullenbak' when the parent is still in the trash.
    onError: (e) => toast.error(errorMessage(e, 'Terugzetten mislukt')),
  });
}

export function usePurge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entity, recordId }: { entity: TrashEntity; recordId: string }) => {
      const { data, error } = await db.rpc('crm_purge', { p_entity: entity, p_record_id: recordId });
      if (error) throw error;
      return (data ?? 0) as number;
    },
    meta: { silent: true },
    onSuccess: () => { refreshCrm(qc); toast.success('Definitief verwijderd'); },
    onError: (e) => toast.error(errorMessage(e, 'Definitief verwijderen mislukt')),
  });
}
