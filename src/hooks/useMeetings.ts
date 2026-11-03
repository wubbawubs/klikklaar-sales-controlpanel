import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/hooks/useOrgId';
import { fireWebhook } from '@/lib/webhooks';
import type { ProposalKind, ProposalPayload } from '@/lib/meetingProposals';

export type ImportStatus = 'analyzing' | 'ready' | 'failed';
export type ProposalStatus = 'open' | 'applied' | 'dismissed' | 'failed';

export interface MeetingImport {
  id: string; org_id: string; title: string | null; meeting_date: string;
  status: ImportStatus; error: string | null; created_at: string; analyzed_at: string | null;
  transcript?: string;
}

export interface MeetingProposal {
  id: string; import_id: string; position: number; kind: ProposalKind;
  company_id: string | null; deal_id: string | null; company_label: string; candidates: string[];
  payload: ProposalPayload; expected: { stage_id: string | null; value_eur: number | null; assigned_to: string | null } | null;
  quote: string | null; status: ProposalStatus; error: string | null;
}

/** The user's edits to a proposal before applying it. */
export interface ProposalDraft {
  company_id: string | null; deal_id: string | null; payload: ProposalPayload; confirm_closed: boolean;
}

export function useMeetingImports() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['meeting-imports', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from('meeting_imports' as any)
        .select('id, org_id, title, meeting_date, status, error, created_at, analyzed_at, proposals:meeting_proposals(status)')
        .eq('org_id', orgId!).order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as (MeetingImport & { proposals: { status: ProposalStatus }[] })[];
    },
  });
}

export function useMeetingImport(id: string | undefined) {
  return useQuery({
    queryKey: ['meeting-import', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('meeting_imports' as any).select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data as unknown as MeetingImport | null;
    },
    refetchInterval: q => ((q.state.data as MeetingImport | null | undefined)?.status === 'analyzing' ? 3000 : false),
  });
}

export function useMeetingProposals(importId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['meeting-proposals', importId],
    enabled: !!importId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('meeting_proposals' as any)
        .select('*').eq('import_id', importId!).order('position');
      if (error) throw error;
      return (data ?? []) as unknown as MeetingProposal[];
    },
  });
}

async function startAnalysis(importId: string) {
  const { error } = await supabase.functions.invoke('meeting-analyze', { body: { import_id: importId } });
  if (error) throw new Error(`Analyse kon niet starten: ${error.message}`);
}

export function useCreateMeetingImport() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async (input: { transcript: string; meeting_date: string; title: string | null }) => {
      if (!orgId) throw new Error('Kies eerst één organisatie');
      const { data, error } = await supabase.from('meeting_imports' as any)
        .insert({ org_id: orgId, transcript: input.transcript, meeting_date: input.meeting_date, title: input.title || null })
        .select('id').single();
      if (error) throw error;
      const id = (data as unknown as { id: string }).id;
      try {
        await startAnalysis(id);
      } catch (e) {
        // Keep the transcript; mark it failed so the user can retry from the review page.
        await supabase.from('meeting_imports' as any).update({ status: 'failed', error: (e as Error).message }).eq('id', id);
      }
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting-imports', orgId] }),
  });
}

export function useReanalyze() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (importId: string) => startAnalysis(importId),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['meeting-import', id] });
      qc.invalidateQueries({ queryKey: ['meeting-proposals', id] });
    },
  });
}

export function useApplyProposal() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async ({ proposal, draft, expected }: {
      proposal: MeetingProposal; draft: ProposalDraft;
      expected?: { stage_id: string | null; value_eur: number | null; assigned_to: string | null } | null;
    }) => {
      const { data, error } = await supabase.rpc('apply_meeting_proposal' as any, {
        p_proposal_id: proposal.id,
        p_input: { company_id: draft.company_id, deal_id: draft.deal_id, payload: draft.payload, confirm_closed: draft.confirm_closed, expected: expected ?? null },
      });
      if (error) throw error;
      const result = data as unknown as { ok: boolean; error?: string; events?: { event: string; payload: Record<string, unknown> }[] };
      if (!result?.ok) throw new Error(result?.error || 'Toepassen mislukt');
      if (orgId) for (const e of result.events ?? []) await fireWebhook(orgId, e.event, e.payload);
      return result;
    },
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: ['meeting-proposals', v.proposal.import_id] });
      qc.invalidateQueries({ queryKey: ['meeting-imports'] });
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['companies'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
      qc.invalidateQueries({ queryKey: ['company-activities'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}

export function useSetProposalStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ proposal, status }: { proposal: MeetingProposal; status: 'open' | 'dismissed' }) => {
      const { error } = await supabase.from('meeting_proposals' as any)
        .update({ status, error: null }).eq('id', proposal.id).neq('status', 'applied');
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['meeting-proposals', v.proposal.import_id] }),
  });
}
