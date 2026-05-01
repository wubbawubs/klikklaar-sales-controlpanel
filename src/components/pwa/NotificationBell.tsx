import { useState, useEffect } from 'react';
import { Bell, Check, CheckCheck, Inbox, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';

interface Notification {
  id: string;
  title: string;
  body: string | null;
  type: string | null;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchUnread = async () => {
    if (!user) return;
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    setUnreadCount(count ?? 0);

    if ('setAppBadge' in navigator) {
      if (count && count > 0) {
        (navigator as any).setAppBadge(count);
      } else {
        (navigator as any).clearAppBadge();
      }
    }
  };

  const fetchRecent = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(15);
    setNotifications((data as Notification[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    fetchUnread();

    const channel = supabase
      .channel('notifications-bell')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => {
          fetchUnread();
          if (open) fetchRecent();
        }
      )
      .subscribe();

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'BADGE_UPDATE') fetchUnread();
    };
    navigator.serviceWorker?.addEventListener('message', handleMessage);

    return () => {
      supabase.removeChannel(channel);
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, [user, open]);

  useEffect(() => {
    if (open) fetchRecent();
  }, [open]);

  const markAsRead = async (id: string, actionUrl?: string | null) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    fetchUnread();
    if (actionUrl) {
      setOpen(false);
      navigate(actionUrl);
    }
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const display = unreadCount > 99 ? '99+' : unreadCount;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label={`Notificaties${unreadCount > 0 ? ` (${unreadCount} ongelezen)` : ''}`}
        >
          <Bell className="h-[18px] w-[18px]" />
          {unreadCount > 0 && (
            <span
              className={cn(
                'absolute top-0.5 right-0.5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground font-bold ring-2 ring-background',
                unreadCount > 9 ? 'text-[9px] min-w-[18px] h-[18px] px-1' : 'text-[10px] w-[16px] h-[16px]'
              )}
            >
              {display}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[380px] p-0 overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <div>
            <p className="text-sm font-semibold text-foreground">Notificaties</p>
            <p className="text-[11px] text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} ongelezen` : 'Alles gelezen'}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllRead}
              className="h-7 text-[11px] gap-1"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Alles
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[400px]">
          {loading ? (
            <div className="text-center py-10 text-muted-foreground text-sm">Laden...</div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-10 px-4">
              <Inbox className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">Geen notificaties</p>
            </div>
          ) : (
            <div className="py-1">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markAsRead(n.id, n.action_url)}
                  className={cn(
                    'w-full text-left px-4 py-2.5 transition-colors flex items-start gap-3 border-b border-border/30 last:border-0',
                    n.is_read ? 'hover:bg-muted/50' : 'bg-primary/5 hover:bg-primary/10'
                  )}
                >
                  <div
                    className={cn(
                      'mt-1.5 w-1.5 h-1.5 rounded-full shrink-0',
                      n.is_read ? 'bg-transparent' : 'bg-primary'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-[13px] leading-snug', !n.is_read && 'font-medium')}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                        {n.body}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: nl })}
                    </p>
                  </div>
                  {!n.is_read && <Check className="h-3.5 w-3.5 text-muted-foreground/40 mt-1 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="border-t border-border/60 px-2 py-1.5 flex items-center justify-between bg-muted/30">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpen(false);
              navigate('/notifications');
            }}
            className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Alle bekijken
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpen(false);
              navigate('/notifications');
            }}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            aria-label="Instellingen"
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
