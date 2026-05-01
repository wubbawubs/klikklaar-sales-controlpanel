import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CLOSER_STATUSES, type CloserStatus } from '@/lib/closer-statuses';
import { AppointmentCard, type CloserAppointment } from './AppointmentCard';
import { AppointmentDetailSheet } from './AppointmentDetailSheet';
import { fetchAll } from '@/lib/fetch-all';

export function CloserKanban() {
  const [items, setItems] = useState<CloserAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CloserAppointment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await fetchAll<any>('closer_appointments', (q) =>
      q.select('id, status, org_name, contact_name, contact_email, contact_phone, scheduled_at, notes, deal_value_eur, caller_sales_executive_id')
        .order('scheduled_at', { ascending: true, nullsFirst: false })
    );

    // Resolve caller names in one batch
    const callerIds = Array.from(new Set(rows.map(r => r.caller_sales_executive_id).filter(Boolean)));
    const nameMap = new Map<string, string>();
    if (callerIds.length) {
      const { data: callers } = await supabase
        .from('sales_executives')
        .select('id, full_name')
        .in('id', callerIds);
      callers?.forEach(c => nameMap.set(c.id, c.full_name || ''));
    }

    setItems(rows.map(r => ({ ...r, caller_name: r.caller_sales_executive_id ? nameMap.get(r.caller_sales_executive_id) ?? null : null })));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    const channel = supabase
      .channel('closer-appointments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'closer_appointments' }, () => load())
      .subscribe();
    return () => {
      clearInterval(id);
      supabase.removeChannel(channel);
    };
  }, [load]);

  const grouped: Record<CloserStatus, CloserAppointment[]> = {
    call: [], no_show: [], follow_up: [], deal: [], nog_betalen: [], no_deal: [],
  };
  items.forEach(i => {
    const s = (i.status as CloserStatus);
    if (grouped[s]) grouped[s].push(i);
  });

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {CLOSER_STATUSES.map(col => (
          <div key={col.key} className="bg-muted/40 rounded-lg p-2 min-h-[200px] flex flex-col">
            <div className="flex items-center justify-between px-1 pb-2 mb-2 border-b border-border">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{col.label}</span>
              <span className="text-xs font-semibold text-foreground bg-background rounded-full px-2 py-0.5">
                {grouped[col.key].length}
              </span>
            </div>
            <div className="space-y-2 flex-1">
              {grouped[col.key].length === 0 && (
                <p className="text-xs text-muted-foreground italic px-1 py-4 text-center">Leeg</p>
              )}
              {grouped[col.key].map(a => (
                <AppointmentCard key={a.id} appointment={a} onClick={() => setSelected(a)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <AppointmentDetailSheet
        appointment={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        onUpdated={load}
      />
    </>
  );
}
