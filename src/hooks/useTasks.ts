import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/hooks/useOrgId';
import { useAllCompanies } from '@/hooks/useMeetings';
import { useOrgContactOptions } from '@/hooks/useDealContacts';
import { useAuth } from '@/hooks/useAuth';
import { localToday } from '@/lib/tasks';
import type { Task, TaskStatus } from '@/lib/crmTypes';

// CRM tables are not in the generated Supabase types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface TaskFilter {
  ownerId?: string; dealId?: string; companyId?: string; contactId?: string; includeClosed?: boolean;
}

const TASK_SELECT = '*, deal:deals(title, funnel_id), company:companies(name), contact:contacts(name)';

/** Tasks of the active organisation (disabled in the group view). Trashed rows are hidden by RLS. */
export function useTasks(filter: TaskFilter = {}) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['tasks', orgId, filter],
    enabled: !!orgId,
    queryFn: async () => {
      let q = db.from('crm_tasks').select(TASK_SELECT).eq('org_id', orgId!);
      if (filter.ownerId) q = q.eq('owner_id', filter.ownerId);
      if (filter.dealId) q = q.eq('deal_id', filter.dealId);
      if (filter.companyId) q = q.eq('company_id', filter.companyId);
      if (filter.contactId) q = q.eq('contact_id', filter.contactId);
      if (!filter.includeClosed) q = q.not('status', 'in', '(done,cancelled)');
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });
}

export type TaskInput = Partial<Omit<Task, 'id' | 'org_id' | 'deal' | 'company' | 'contact'>> & { title: string };

export function useCreateTask() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TaskInput) => {
      if (!orgId) throw new Error('Geen organisatie geselecteerd');
      const { error } = await db.from('crm_tasks').insert({ ...input, org_id: orgId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<TaskInput> }) => {
      const body: Record<string, unknown> = { ...patch };
      // Completing stamps who/when; any other status clears it again.
      if (patch.status !== undefined) {
        const done = (patch.status as TaskStatus) === 'done';
        body.completed_at = done ? new Date().toISOString() : null;
        body.completed_by = done ? user?.id ?? null : null;
      }
      const { error } = await db.from('crm_tasks').update(body).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

/** Soft delete: the row moves to the trash (RLS then hides it, so 0 rows come back). */
export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('crm_tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Taak verplaatst naar prullenbak');
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['trash'] });
    },
  });
}

/** My open tasks that are due today or overdue (head/count query). */
export function useMyOpenTaskCount() {
  const orgId = useOrgId();
  const { user } = useAuth();
  const today = localToday();
  return useQuery({
    queryKey: ['tasks', orgId, 'my-open-count', user?.id, today],
    enabled: !!orgId && !!user?.id,
    queryFn: async () => {
      const { count, error } = await db.from('crm_tasks').select('id', { count: 'exact', head: true })
        .eq('org_id', orgId!).eq('owner_id', user!.id)
        .not('status', 'in', '(done,cancelled)').lte('due_date', today);
      if (error) throw error;
      return (count ?? 0) as number;
    },
  });
}

/** Pick lists for a task's deal/company/contact links (only fetched while `enabled`). */
export function useTaskLinkOptions(enabled = true) {
  const orgId = useOrgId();
  const deals = useQuery({
    queryKey: ['deal-options', orgId],
    enabled: !!orgId && enabled,
    queryFn: async () => {
      const { data, error } = await db.from('deals').select('id, title, funnel_id').eq('org_id', orgId!).order('title');
      if (error) throw error;
      return (data ?? []) as { id: string; title: string; funnel_id: string | null }[];
    },
  });
  const companies = useAllCompanies();
  const contacts = useOrgContactOptions(enabled);
  return { deals: deals.data ?? [], companies: companies.data ?? [], contacts: contacts.data ?? [] };
}
