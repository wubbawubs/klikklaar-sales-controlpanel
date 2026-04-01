import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const fetchUnread = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      setUnreadCount(count ?? 0);

      // Update app badge
      if ('setAppBadge' in navigator) {
        if (count && count > 0) {
          (navigator as any).setAppBadge(count);
        } else {
          (navigator as any).clearAppBadge();
        }
      }
    };

    fetchUnread();

    // Realtime subscription
    const channel = supabase
      .channel('notifications-bell')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => fetchUnread()
      )
      .subscribe();

    // Listen for SW badge updates
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'BADGE_UPDATE') fetchUnread();
    };
    navigator.serviceWorker?.addEventListener('message', handleMessage);

    return () => {
      supabase.removeChannel(channel);
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, [user]);

  const display = unreadCount > 99 ? '99+' : unreadCount;

  return (
    <button
      onClick={() => navigate('/notifications')}
      className="relative p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors"
      aria-label={`Notificaties${unreadCount > 0 ? ` (${unreadCount} ongelezen)` : ''}`}
    >
      <Bell className="h-4.5 w-4.5 text-sidebar-foreground/70" />
      {unreadCount > 0 && (
        <span className={cn(
          "absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground font-bold",
          unreadCount > 9 ? "text-[9px] min-w-[18px] h-[18px] px-1" : "text-[10px] w-[16px] h-[16px]"
        )}>
          {display}
        </span>
      )}
    </button>
  );
}
