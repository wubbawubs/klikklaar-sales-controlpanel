import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

export function useNotifications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['notifications', user?.id],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_notifications')
        .select('id, type, title, body, link, read, created_at')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as AppNotification[];
    },
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (ids?: string[]) => {
      let q = supabase.from('app_notifications').update({ read: true }).eq('read', false);
      if (ids && ids.length) q = q.in('id', ids);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', user?.id] }),
  });
}

// Fire-and-forget: create an in-app notification for another user.
export async function notifyUser(input: {
  userId: string; orgId?: string | null; type: string; title: string; body?: string; link?: string;
}): Promise<void> {
  try {
    await supabase.functions.invoke('notify-user', { body: input });
  } catch {
    // best-effort — never block the originating action on a notification
  }
}
