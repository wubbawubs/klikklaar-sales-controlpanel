import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/hooks/useOrgId';
import { CLOSER_STATUSES, type CloserStatus } from '@/lib/closer-statuses';
import { AppointmentCard, type CloserAppointment } from './AppointmentCard';
import { AppointmentDetailDialog } from './AppointmentDetailDialog';
import { fetchAll } from '@/lib/fetch-all';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { toast } from 'sonner';
import { Inbox } from 'lucide-react';

// Per-status accent color (used for column header dot + top stripe)
const STATUS_ACCENT: Record<CloserStatus, string> = {
  call:         'bg-blue-500',
  no_show:      'bg-amber-500',
  follow_up:    'bg-purple-500',
  deal:         'bg-emerald-500',
  nog_betalen:  'bg-orange-500',
  no_deal:      'bg-rose-500',
};

export function CloserKanban() {
  const [items, setItems] = useState<CloserAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CloserAppointment | null>(null);
  const orgId = useOrgId();

  const load = useCallback(async () => {
    const rows = await fetchAll<any>('closer_appointments', (q) => {
      let qq = q.select('id, status, org_name, contact_name, contact_email, contact_phone, scheduled_at, notes, deal_value_eur, caller_sales_executive_id, last_activity_at, next_action_at, organization_id')
        .order('scheduled_at', { ascending: true, nullsFirst: false });
      if (orgId) qq = qq.eq('organization_id', orgId);
      return qq;
    });

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

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newStatus = destination.droppableId as CloserStatus;
    const item = items.find(i => i.id === draggableId);
    if (!item || item.status === newStatus) {
      // same column reorder, ignore (no manual ordering yet)
      return;
    }

    // optimistic update
    const prev = items;
    setItems(items.map(i => (i.id === draggableId ? { ...i, status: newStatus } : i)));

    const { error } = await supabase
      .from('closer_appointments')
      .update({ status: newStatus })
      .eq('id', draggableId);

    if (error) {
      toast.error('Kon status niet bijwerken');
      setItems(prev);
    } else {
      toast.success(`Verplaatst naar ${CLOSER_STATUSES.find(s => s.key === newStatus)?.label}`);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {CLOSER_STATUSES.map(col => (
            <Droppable droppableId={col.key} key={col.key}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`relative overflow-hidden bg-card border rounded-xl p-2.5 min-h-[220px] flex flex-col transition-all animate-fade-in ${
                    snapshot.isDraggingOver
                      ? 'border-primary/40 ring-1 ring-primary/20 bg-primary/[0.03]'
                      : 'border-border/60 shadow-card'
                  }`}
                >
                  <span className={`absolute top-0 left-0 right-0 h-[2px] ${STATUS_ACCENT[col.key]}`} />
                  <div className="flex items-center justify-between px-1 pt-0.5 pb-2.5 mb-2 border-b border-border/60">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_ACCENT[col.key]} shrink-0`} />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70 truncate">{col.label}</span>
                    </div>
                    <span className="text-[11px] font-semibold text-muted-foreground bg-background border border-border/60 rounded-full px-2 py-0.5 tabular-nums">
                      {grouped[col.key].length}
                    </span>
                  </div>
                  <div className="space-y-2 flex-1">
                    {grouped[col.key].length === 0 && !snapshot.isDraggingOver && (
                      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/60">
                        <div className="h-10 w-10 rounded-full border border-dashed border-border flex items-center justify-center mb-2">
                          <Inbox className="h-4 w-4" />
                        </div>
                        <p className="text-[11px]">Geen kaarten</p>
                      </div>
                    )}
                    {grouped[col.key].map((a, index) => (
                      <Draggable draggableId={a.id} index={index} key={a.id}>
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                          >
                            <AppointmentCard
                              appointment={a}
                              onClick={() => setSelected(a)}
                              isDragging={dragSnapshot.isDragging}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>

      <AppointmentDetailDialog
        appointment={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        onUpdated={load}
      />
    </>
  );
}
