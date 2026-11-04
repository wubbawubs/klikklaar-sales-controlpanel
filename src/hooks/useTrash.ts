import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/hooks/useOrgId';
import { useAuth } from '@/hooks/useAuth';
import { errorMessage } from '@/lib/errors';
import type { PurgeResult, TrashEntity, TrashItem } from '@/lib/crmTypes';
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
      // 1-arg version: the database answers for auth.uid() only.
      const { data, error } = await db.rpc('is_org_admin', { _org: orgId });
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

/**
 * Removes the documents of a purge from storage. The purge itself already succeeded, so this never throws:
 * it returns the paths that are still in the bucket (error, or silently skipped because storage RLS
 * only lets members of the org folder delete).
 */
async function removePurgedFiles(files: string[]): Promise<string[]> {
  if (files.length === 0) return [];
  try {
    const { data, error } = await supabase.storage.from('company-documents').remove(files);
    if (error) return files;
    const removed = new Set((data ?? []).map((o: { name: string }) => o.name));
    return files.filter(f => !removed.has(f));
  } catch {
    return files;
  }
}

export function usePurge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entity, recordId }: { entity: TrashEntity; recordId: string }) => {
      const { data, error } = await db.rpc('crm_purge', { p_entity: entity, p_record_id: recordId });
      if (error) throw error;
      const result = (data ?? { rows: 0, files: [] }) as PurgeResult;
      const leftover = await removePurgedFiles(result.files ?? []);
      return { ...result, leftover };
    },
    meta: { silent: true },
    onSuccess: ({ leftover }) => {
      refreshCrm(qc);
      toast.success('Definitief verwijderd');
      if (leftover.length > 0) {
        toast.error(`${leftover.length === 1 ? 'Eén bestand is' : `${leftover.length} bestanden zijn`} niet uit de opslag `
          + `verwijderd (bucket company-documents): ${leftover.join(', ')}`);
      }
    },
    onError: (e) => toast.error(errorMessage(e, 'Definitief verwijderen mislukt')),
  });
}
