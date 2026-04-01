import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PushToggle } from '@/components/pwa/PushToggle';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface Notification {
  id: string;
  title: string;
  body: string | null;
  type: string | null;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    setNotifications((data as Notification[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchNotifications();

    if (!user) return;
    const channel = supabase
      .channel('notifications-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => fetchNotifications())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markAsRead = async (id: string, actionUrl?: string | null) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    if (actionUrl) navigate(actionUrl);
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notificaties</h1>
          <p className="text-sm text-muted-foreground">{unreadCount} ongelezen</p>
        </div>
        <div className="flex items-center gap-3">
          <PushToggle />
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead} className="text-xs">
              <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
              Alles gelezen
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-1">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Laden...</div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-12">
            <Bell className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Geen notificaties</p>
          </div>
        ) : (
          notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => markAsRead(n.id, n.action_url)}
              className={cn(
                "w-full text-left px-4 py-3 rounded-lg transition-colors flex items-start gap-3",
                n.is_read ? "bg-transparent hover:bg-muted/50" : "bg-primary/5 hover:bg-primary/10"
              )}
            >
              <div className={cn("mt-1 w-2 h-2 rounded-full shrink-0", n.is_read ? "bg-transparent" : "bg-primary")} />
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm", !n.is_read && "font-medium")}>{n.title}</p>
                {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                <p className="text-[11px] text-muted-foreground/60 mt-1">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: nl })}
                </p>
              </div>
              {!n.is_read && <Check className="h-4 w-4 text-muted-foreground/40 mt-1 shrink-0" />}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
