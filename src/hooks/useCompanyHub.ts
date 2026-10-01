import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/hooks/useOrgId';
import { companyDocPath, validateDoc } from '@/lib/companyDocs';
import { toast } from 'sonner';

export interface Company {
  id: string; org_id: string; name: string; website: string | null; industry: string | null;
  city: string | null; phone: string | null; email: string | null; notes: string | null;
}
export interface Contact { id: string; name: string; email: string | null; phone: string | null; title: string | null; company_id: string | null }
export type ItemCategory = 'preparation' | 'intake' | 'other';
export interface CompanyItem {
  id: string; company_id: string; item_type: 'note' | 'document'; category: ItemCategory;
  title: string | null; body: string | null; file_name: string | null; storage_path: string | null;
  mime_type: string | null; size_bytes: number | null; created_at: string; updated_at: string;
}

const errToast = (fallback: string) => (e: unknown) => toast.error(e instanceof Error ? e.message : fallback);

export function useCompany(companyId: string | null) {
  return useQuery({
    queryKey: ['company', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('*').eq('id', companyId!).single();
      if (error) throw error;
      return data as Company;
    },
  });
}

export function useUpdateCompany() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<Omit<Company, 'id' | 'org_id'>>) => {
      const { error } = await supabase.from('companies').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['company', v.id] });
      qc.invalidateQueries({ queryKey: ['companies', orgId] });
      qc.invalidateQueries({ queryKey: ['deals', orgId] });
      toast.success('Bedrijf bijgewerkt');
    },
    onError: errToast('Bijwerken mislukt'),
  });
}

// Create a company and link it to the deal in one go (from the "Koppel een bedrijf" state).
export function useCreateCompanyForDeal() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async ({ dealId, name }: { dealId: string; name: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from('companies')
        .insert({ org_id: orgId, name, created_by: user?.id }).select('id').single();
      if (error) throw error;
      const { error: e2 } = await supabase.from('deals').update({ company_id: data.id }).eq('id', dealId);
      if (e2) throw e2;
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies', orgId] });
      qc.invalidateQueries({ queryKey: ['deals', orgId] });
    },
    onError: errToast('Bedrijf aanmaken mislukt'),
  });
}

export function useContact(contactId: string | null) {
  return useQuery({
    queryKey: ['contact', contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase.from('contacts')
        .select('id, name, email, phone, title, company_id').eq('id', contactId!).single();
      if (error) throw error;
      return data as Contact;
    },
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<Omit<Contact, 'id'>>) => {
      const { error } = await supabase.from('contacts').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['contact', v.id] });
      qc.invalidateQueries({ queryKey: ['deals', orgId] });
      toast.success('Contact bijgewerkt');
    },
    onError: errToast('Bijwerken mislukt'),
  });
}

export function useCompanyDeals(companyId: string | null) {
  return useQuery({
    queryKey: ['company-deals', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from('deals')
        .select('id, title, stage:pipeline_stages(name)').eq('company_id', companyId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; title: string; stage: { name: string } | null }[];
    },
  });
}

export function useCompanyItems(companyId: string | null) {
  return useQuery({
    queryKey: ['company-items', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from('company_items').select('*')
        .eq('company_id', companyId!).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CompanyItem[];
    },
  });
}

export function useSaveCompanyNote() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async ({ id, companyId, category, title, body }: {
      id?: string; companyId: string; category: ItemCategory; title: string; body: string;
    }) => {
      if (id) {
        const { error } = await supabase.from('company_items').update({ category, title, body }).eq('id', id);
        if (error) throw error;
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('company_items').insert({
        org_id: orgId, company_id: companyId, item_type: 'note', category, title, body, created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ['company-items', v.companyId] }); toast.success('Notitie opgeslagen'); },
    onError: errToast('Opslaan mislukt'),
  });
}

export function useUploadCompanyDocument() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async ({ companyId, category, file }: { companyId: string; category: ItemCategory; file: File }) => {
      const invalid = validateDoc(file);
      if (invalid) throw new Error(invalid);
      const path = companyDocPath(orgId!, companyId, file.name, crypto.randomUUID());
      const { error: upErr } = await supabase.storage.from('company-documents').upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('company_items').insert({
        org_id: orgId, company_id: companyId, item_type: 'document', category,
        title: file.name, file_name: file.name, storage_path: path,
        mime_type: file.type || null, size_bytes: file.size, created_by: user?.id,
      });
      if (error) {
        await supabase.storage.from('company-documents').remove([path]); // no orphan files
        throw error;
      }
    },
    onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ['company-items', v.companyId] }); toast.success('Document toegevoegd'); },
    onError: errToast('Upload mislukt'),
  });
}

export function useDeleteCompanyItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: CompanyItem) => {
      if (item.storage_path) {
        const { error: sErr } = await supabase.storage.from('company-documents').remove([item.storage_path]);
        if (sErr) throw sErr; // keep the row so the file is not lost from view
      }
      const { error } = await supabase.from('company_items').delete().eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: (_, item) => qc.invalidateQueries({ queryKey: ['company-items', item.company_id] }),
    onError: errToast('Verwijderen mislukt'),
  });
}

export async function openCompanyDocument(path: string): Promise<void> {
  const { data, error } = await supabase.storage.from('company-documents').createSignedUrl(path, 60);
  if (error || !data) { toast.error('Document openen mislukt'); return; }
  window.open(data.signedUrl, '_blank', 'noopener');
}
