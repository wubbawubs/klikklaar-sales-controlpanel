import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/hooks/useOrgId';
import { errorMessage } from '@/lib/errors';

// deal_contacts is not in the generated Supabase types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface ContactOption {
  id: string; name: string; email: string | null; title: string | null; company_id: string | null;
}

/** All live contacts of the org, to pick one for a deal. */
export function useOrgContactOptions(enabled = true) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['contact-options', orgId],
    enabled: !!orgId && enabled,
    queryFn: async () => {
      const { data, error } = await db.from('contacts').select('id, name, email, title, company_id')
        .eq('org_id', orgId!).order('name');
      if (error) throw error;
      return (data ?? []) as ContactOption[];
    },
  });
}

/**
 * Writes go to deal_contacts only; DB triggers keep deals.contact_id in sync with the primary row
 * and drop the previous primary when a new one is set.
 */
export function useDealContactMutations(dealId: string) {
  const qc = useQueryClient();
  const orgId = useOrgId();
  const done = () => {
    qc.invalidateQueries({ queryKey: ['deal-contacts', dealId] });
    qc.invalidateQueries({ queryKey: ['deals', orgId] });
    qc.invalidateQueries({ queryKey: ['deal-history', dealId] });
  };
  const opts = (fallback: string) => ({
    onSuccess: done, meta: { silent: true }, onError: (e: unknown) => toast.error(errorMessage(e, fallback)),
  });

  const add = useMutation({
    mutationFn: async ({ contactId, role, isPrimary }: { contactId: string; role?: string | null; isPrimary?: boolean }) => {
      const { error } = await db.from('deal_contacts').insert({
        deal_id: dealId, contact_id: contactId, org_id: orgId, role: role || null, is_primary: !!isPrimary,
      });
      if (error) throw error;
    },
    ...opts('Koppelen mislukt'),
  });
  const setPrimary = useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await db.from('deal_contacts').update({ is_primary: true })
        .eq('deal_id', dealId).eq('contact_id', contactId);
      if (error) throw error;
    },
    ...opts('Primair maken mislukt'),
  });
  const setRole = useMutation({
    mutationFn: async ({ contactId, role }: { contactId: string; role: string | null }) => {
      const { error } = await db.from('deal_contacts').update({ role })
        .eq('deal_id', dealId).eq('contact_id', contactId);
      if (error) throw error;
    },
    ...opts('Rol opslaan mislukt'),
  });
  const remove = useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await db.from('deal_contacts').delete().eq('deal_id', dealId).eq('contact_id', contactId);
      if (error) throw error;
    },
    ...opts('Ontkoppelen mislukt'),
  });
  return { add, setPrimary, setRole, remove };
}
