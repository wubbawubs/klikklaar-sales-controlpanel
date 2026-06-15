import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/hooks/useOrgId';
import { toast } from 'sonner';

export interface Board { id: string; org_id: string; name: string; description: string | null; color: string; created_at: string; company_id: string | null; company?: { name: string } | null }
export interface Client { id: string; name: string }
export interface BoardList { id: string; board_id: string; name: string; position: number }
export interface Card {
  id: string; board_id: string; list_id: string;
  title: string; description: string | null;
  assigned_to: string | null; due_date: string | null;
  position: number; labels: string[];
  created_at: string; updated_at: string;
}

export function useBoards() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['boards', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('boards').select('*, company:companies(name)').eq('org_id', orgId!).order('created_at');
      if (error) throw error;
      return (data ?? []) as Board[];
    },
  });
}

// Clients = CRM companies, scoped to the current org.
export function useClients() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['clients', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies').select('id, name').eq('org_id', orgId!).order('name');
      if (error) throw error;
      return (data ?? []) as Client[];
    },
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from('companies').insert({ name, org_id: orgId }).select('id, name').single();
      if (error) throw error;
      return data as Client;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); toast.success('Klant toegevoegd'); },
  });
}

export function useBoard(boardId: string) {
  return useQuery({
    queryKey: ['board', boardId],
    enabled: !!boardId,
    queryFn: async () => {
      const [{ data: lists, error: le }, { data: cards, error: ce }] = await Promise.all([
        supabase.from('board_lists').select('*').eq('board_id', boardId).order('position'),
        supabase.from('board_cards').select('*').eq('board_id', boardId).order('position'),
      ]);
      if (le) throw le;
      if (ce) throw ce;
      return {
        lists: (lists ?? []) as BoardList[],
        cards: (cards ?? []) as Card[],
      };
    },
  });
}

export function useCreateBoard() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async ({ name, description, color, companyId }: { name: string; description?: string; color?: string; companyId?: string | null }) => {
      const { data: board, error: be } = await supabase
        .from('boards').insert({ name, description, color: color ?? '#3B82F6', org_id: orgId, company_id: companyId ?? null }).select().single();
      if (be) throw be;
      // Seed default lists
      await supabase.from('board_lists').insert([
        { board_id: board.id, name: 'Backlog',     position: 0 },
        { board_id: board.id, name: 'In Progress', position: 1 },
        { board_id: board.id, name: 'Review',      position: 2 },
        { board_id: board.id, name: 'Done',        position: 3 },
      ]);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['boards'] }); toast.success('Board aangemaakt'); },
  });
}

export function useCreateList(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, position }: { name: string; position: number }) => {
      const { error } = await supabase.from('board_lists').insert({ board_id: boardId, name, position });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board', boardId] }),
  });
}

export function useCreateCard(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ listId, title, position }: { listId: string; title: string; position: number }) => {
      const { error } = await supabase.from('board_cards').insert({ board_id: boardId, list_id: listId, title, position });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board', boardId] }),
  });
}

export function useMoveCard(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cardId, listId, position }: { cardId: string; listId: string; position: number }) => {
      const { error } = await supabase
        .from('board_cards').update({ list_id: listId, position }).eq('id', cardId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board', boardId] }),
  });
}

export function useUpdateCard(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Card> & { id: string }) => {
      const { error } = await supabase.from('board_cards').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['board', boardId] }); toast.success('Opgeslagen'); },
  });
}

// ---- Teammates (for tagging) ----
export interface TeamMember { user_id: string; full_name: string | null; email: string | null }

export function useTeamMembers() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['team-members', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      // org co-members are visible via RLS; list everyone in this org
      const { data: memberships } = await supabase
        .from('user_organizations').select('user_id').eq('organization_id', orgId!);
      const ids = (memberships ?? []).map((m: { user_id: string }) => m.user_id);
      if (ids.length === 0) return [] as TeamMember[];
      const { data } = await supabase
        .from('profiles').select('user_id, full_name, email').in('user_id', ids);
      return (data ?? []) as TeamMember[];
    },
  });
}

// ---- Card members (tagging people) ----
export interface CardMember { user_id: string; full_name: string | null; email: string | null }

export function useCardMembers(cardId: string) {
  return useQuery({
    queryKey: ['card-members', cardId],
    enabled: !!cardId,
    queryFn: async () => {
      const { data: rows } = await supabase.from('card_members').select('user_id').eq('card_id', cardId);
      const ids = (rows ?? []).map((r: { user_id: string }) => r.user_id);
      if (ids.length === 0) return [] as CardMember[];
      const { data: profs } = await supabase.from('profiles').select('user_id, full_name, email').in('user_id', ids);
      return (profs ?? []) as CardMember[];
    },
  });
}

export function useToggleCardMember(cardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, add }: { userId: string; add: boolean }) => {
      if (add) {
        const { error } = await supabase.from('card_members').insert({ card_id: cardId, user_id: userId });
        if (error && !/duplicate/i.test(error.message)) throw error;
      } else {
        const { error } = await supabase.from('card_members').delete().eq('card_id', cardId).eq('user_id', userId);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['card-members', cardId] }),
  });
}

// ---- Card attachments (pictures / files) ----
export interface CardAttachment { id: string; url: string; name: string | null; mime_type: string | null; created_at: string }

export function useCardAttachments(cardId: string) {
  return useQuery({
    queryKey: ['card-attachments', cardId],
    enabled: !!cardId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('card_attachments').select('id, url, name, mime_type, created_at')
        .eq('card_id', cardId).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CardAttachment[];
    },
  });
}

export function useUploadAttachment(cardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const { data: { user } } = await supabase.auth.getUser();
      const path = `${cardId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error: upErr } = await supabase.storage.from('card-attachments').upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('card-attachments').getPublicUrl(path);
      const { error } = await supabase.from('card_attachments').insert({
        card_id: cardId, url: pub.publicUrl, name: file.name, mime_type: file.type, uploaded_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['card-attachments', cardId] }); toast.success('Bijlage toegevoegd'); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Upload mislukt'),
  });
}

export function useDeleteAttachment(cardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('card_attachments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['card-attachments', cardId] }),
  });
}
