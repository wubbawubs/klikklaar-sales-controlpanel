import { useState, useEffect } from 'react';
import { Bell, BellOff, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const VAPID_PUBLIC_KEY = 'BExb4UQRZqADvmFYqt--SOITZ-XD5ws_on8iO3kCMLDPOUOd1p2fgl3_lMXr_pLFWSNXhH8BB59R2XdjWQjR9vk';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

type PushState = 'loading' | 'enabled' | 'disabled' | 'unsupported' | 'denied';

export function PushToggle() {
  const { user } = useAuth();
  const [state, setState] = useState<PushState>('loading');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }

    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? 'enabled' : 'disabled');
    }).catch(() => setState('disabled'));
  }, []);

  const subscribe = async () => {
    if (!user) return;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('denied');
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const json = sub.toJSON();
      await supabase.functions.invoke('register-push-subscription', {
        body: {
          endpoint: json.endpoint,
          p256dh_key: json.keys?.p256dh,
          auth_key: json.keys?.auth,
          platform: /iPhone|iPad/.test(navigator.userAgent) ? 'ios' : /Android/.test(navigator.userAgent) ? 'android' : 'web',
        },
      });

      setState('enabled');
      toast.success('Push notificaties ingeschakeld');
    } catch (err) {
      console.error('Push subscribe error:', err);
      toast.error('Kon push notificaties niet inschakelen');
    }
  };

  const unsubscribe = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await supabase.functions.invoke('unregister-push-subscription', {
          body: { endpoint },
        });
      }
      setState('disabled');
      toast.success('Push notificaties uitgeschakeld');
    } catch (err) {
      console.error('Push unsubscribe error:', err);
      toast.error('Kon push notificaties niet uitschakelen');
    }
  };

  if (state === 'loading') return null;

  if (state === 'unsupported') {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>Push niet ondersteund</span>
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className="flex items-center gap-2 text-xs text-destructive">
        <BellOff className="h-3.5 w-3.5" />
        <span>Push geblokkeerd in browser</span>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={state === 'enabled' ? unsubscribe : subscribe}
      className="flex items-center gap-2 text-xs h-7 px-2"
    >
      {state === 'enabled' ? (
        <>
          <Bell className="h-3.5 w-3.5 text-primary" />
          <span>Push aan</span>
        </>
      ) : (
        <>
          <BellOff className="h-3.5 w-3.5" />
          <span>Push aan zetten</span>
        </>
      )}
    </Button>
  );
}
