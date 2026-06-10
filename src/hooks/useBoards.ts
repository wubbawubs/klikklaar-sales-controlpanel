import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/hooks/useOrgId';
import { toast } from 'sonner';

export interface Board { id: string; org_id: string; name: string; description: string | null; color: string; created_at: string }
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
        .from('boards').select('*').eq('org_id', orgId!).order('created_at');
      if (error) throw error;
      return (data ?? []) as Board[];
    },
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
    mutationFn: async ({ name, description, color }: { name: string; description?: string; color?: string }) => {
      const { data: board, error: be } = await supabase
        .from('boards').insert({ name, description, color: color ?? '#3B82F6', org_id: orgId }).select().single();
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
