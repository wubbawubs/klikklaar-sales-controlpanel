import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/hooks/useOrgId';
import type { Activity } from '@/hooks/usePipeline';
import { toast } from 'sonner';

export type AppointmentType = 'call' | 'meeting';
export type AppointmentStatus = 'planned' | 'done' | 'cancelled' | 'no_show';
export interface Appointment {
  id: string; org_id: string; deal_id: string | null; company_id: string | null; contact_id: string | null;
  owner_id: string; type: AppointmentType; title: string; starts_at: string; duration_min: number;
  location: string | null; notes: string | null; status: AppointmentStatus; outcome: string | null;
  deal?: { title: string } | null; company?: { name: string } | null; contact?: { name: string; email: string | null } | null;
}
export type AppointmentInput = Omit<Appointment, 'id' | 'org_id' | 'status' | 'outcome' | 'deal' | 'company' | 'contact'> & { id?: string };

const SELECT = '*, deal:deals(title), company:companies(name), contact:contacts(name, email)';
const errToast = (fallback: string) => (e: unknown) => toast.error(e instanceof Error ? e.message : fallback);

export function useDealAppointments(dealId: string) {
  return useQuery({
    queryKey: ['appointments', 'deal', dealId],
    enabled: !!dealId,
    queryFn: async () => {
      const { data, error } = await supabase.from('crm_appointments').select(SELECT)
        .eq('deal_id', dealId).order('starts_at');
      if (error) throw error;
      return (data ?? []) as Appointment[];
    },
  });
}

// All planned appointments in the current CRM (Agenda page + pipeline badges).
export function useAgenda() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['appointments', 'agenda', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from('crm_appointments').select(SELECT)
        .eq('org_id', orgId!).eq('status', 'planned').order('starts_at');
      if (error) throw error;
      return (data ?? []) as Appointment[];
    },
  });
}

function useInvalidateAppointments() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['appointments'] });
}

export function useSaveAppointment() {
  const orgId = useOrgId();
  const invalidate = useInvalidateAppointments();
  return useMutation({
    mutationFn: async ({ id, ...input }: AppointmentInput) => {
      if (id) {
        const { error } = await supabase.from('crm_appointments').update(input).eq('id', id);
        if (error) throw error;
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('crm_appointments')
        .insert({ ...input, org_id: orgId, created_by: user?.id });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Afspraak opgeslagen'); },
    onError: errToast('Opslaan mislukt'),
  });
}

// Mark done/no-show and log it on the deal timeline.
export function useCompleteAppointment() {
  const qc = useQueryClient();
  const invalidate = useInvalidateAppointments();
  return useMutation({
    mutationFn: async ({ appt, outcome, status }: { appt: Appointment; outcome: string; status: 'done' | 'no_show' }) => {
      const { error } = await supabase.from('crm_appointments').update({ status, outcome }).eq('id', appt.id);
      if (error) throw error;
      if (appt.deal_id) {
        const { data: { user } } = await supabase.auth.getUser();
        const label = status === 'no_show' ? 'No-show' : appt.type === 'call' ? 'Call gedaan' : 'Meeting gedaan';
        await supabase.from('deal_activities').insert({
          org_id: appt.org_id, deal_id: appt.deal_id, type: appt.type,
          body: outcome ? `${label}: ${outcome}` : label,
          meta: { appointment_id: appt.id }, created_by: user?.id,
        });
        qc.invalidateQueries({ queryKey: ['activities', appt.deal_id] });
      }
    },
    onSuccess: () => { invalidate(); toast.success('Afspraak afgerond'); },
    onError: errToast('Afronden mislukt'),
  });
}

export function useCancelAppointment() {
  const invalidate = useInvalidateAppointments();
  return useMutation({
    mutationFn: async (appt: Appointment) => {
      const { error } = await supabase.from('crm_appointments').update({ status: 'cancelled' }).eq('id', appt.id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Afspraak geannuleerd'); },
    onError: errToast('Annuleren mislukt'),
  });
}

// Timeline across every deal of a company ("Hele bedrijf" toggle).
export function useCompanyActivities(companyId: string | null) {
  return useQuery({
    queryKey: ['company-activities', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from('deal_activities')
        .select('*, deal:deals!inner(title, company_id)')
        .eq('deal.company_id', companyId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((a: any) => ({ ...a, deal_title: a.deal?.title ?? '' })) as (Activity & { deal_title: string })[];
    },
  });
}
