import { Bell, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications, useMarkNotificationsRead } from '@/hooks/useNotifications';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'nu';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}u`;
  return `${Math.floor(s / 86400)}d`;
}

export function NotificationBell() {
  const { data: notifications = [] } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const navigate = useNavigate();
  const unread = notifications.filter(n => !n.read).length;

  return (
    <DropdownMenu onOpenChange={(open) => { if (!open && unread > 0) markRead.mutate(undefined); }}>
      <DropdownMenuTrigger asChild>
        <button className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="Meldingen">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-semibold">Meldingen</span>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => markRead.mutate(undefined)}>
              <Check className="h-3 w-3" /> Alles gelezen
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">Geen meldingen</p>
          )}
          {notifications.map(n => (
            <button
              key={n.id}
              onClick={() => { if (n.link) navigate(n.link); }}
              className={cn(
                'w-full text-left px-3 py-2.5 border-b last:border-b-0 hover:bg-muted/50 transition-colors',
                !n.read && 'bg-primary/5',
              )}
            >
              <div className="flex items-start gap-2">
                {!n.read && <span className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                <div className={cn('min-w-0 flex-1', n.read && 'pl-4')}>
                  <p className="text-sm font-medium leading-tight">{n.title}</p>
                  {n.body && <p className="text-xs text-muted-foreground truncate mt-0.5">{n.body}</p>}
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">{timeAgo(n.created_at)}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
