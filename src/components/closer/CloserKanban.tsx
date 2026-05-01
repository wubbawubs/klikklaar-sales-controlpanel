import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
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

  const load = useCallback(async () => {
    const rows = await fetchAll<any>('closer_appointments', (q) =>
      q.select('id, status, org_name, contact_name, contact_email, contact_phone, scheduled_at, notes, deal_value_eur, caller_sales_executive_id, last_activity_at, next_action_at')
        .order('scheduled_at', { ascending: true, nullsFirst: false })
    );

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
                  className={`bg-muted/40 rounded-lg p-2 min-h-[200px] flex flex-col transition-colors ${
                    snapshot.isDraggingOver ? 'bg-primary/10 ring-2 ring-primary/30' : ''
                  }`}
                >
                  <div className="flex items-center justify-between px-1 pb-2 mb-2 border-b border-border">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{col.label}</span>
                    <span className="text-xs font-semibold text-foreground bg-background rounded-full px-2 py-0.5">
                      {grouped[col.key].length}
                    </span>
                  </div>
                  <div className="space-y-2 flex-1">
                    {grouped[col.key].length === 0 && !snapshot.isDraggingOver && (
                      <p className="text-xs text-muted-foreground italic px-1 py-4 text-center">Leeg</p>
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
