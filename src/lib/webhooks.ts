import { supabase } from '@/integrations/supabase/client';

export async function fireWebhook(orgId: string, event: string, payload: Record<string, unknown>): Promise<void> {
  const { data: configs } = await supabase
    .from('webhook_configs')
    .select('id, url, events')
    .eq('org_id', orgId)
    .eq('active', true);

  if (!configs?.length) return;

  for (const config of configs) {
    const events = config.events as string[];
    if (!events.includes(event)) continue;

    try {
      const res = await fetch(config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, payload, org_id: orgId, timestamp: new Date().toISOString() }),
      });

      await supabase.from('webhook_logs').insert({
        config_id: config.id,
        event,
        payload,
        response_status: res.status,
        response_body: await res.text().catch(() => null),
      });
    } catch (err) {
      await supabase.from('webhook_logs').insert({
        config_id: config.id,
        event,
        payload,
        response_status: null,
        response_body: String(err),
      });
    }
  }
}
