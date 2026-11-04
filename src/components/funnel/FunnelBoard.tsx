import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { Plus } from 'lucide-react';
import type { Deal } from '@/hooks/usePipeline';
import type { Appointment } from '@/hooks/useAppointments';
import type { CrmField, Funnel, Stage } from '@/lib/crmTypes';
import { formatAmount, funnelTotals } from '@/lib/dealFields';
import { cn } from '@/lib/utils';
import { DealCard } from './DealCard';
import { formatTotal } from './funnelFormat';

export interface FunnelBoardProps {
  stages: Stage[];
  deals: Deal[];
  funnel: Funnel;
  fields: CrmField[];
  ownerName: (userId: string | null) => string | null;
  nextByDeal: Map<string, Appointment>;
  onOpenDeal: (dealId: string) => void;
  onAddDeal: (stage: Stage) => void;
  onMoveDeal: (dealId: string, from: Stage, to: Stage) => void;
}

function ColumnHeader({ stage, deals, funnel, fields, onAdd }: {
  stage: Stage; deals: Deal[]; funnel: Funnel; fields: CrmField[]; onAdd: () => void;
}) {
  // Only show a column total when at least one deal in it has an amount (never a bare "€0").
  const hasAmount = funnel.amount_mode !== 'none' && deals.some(d => formatAmount(d, funnel) !== null);
  const total = hasAmount ? formatTotal(funnelTotals(deals, funnel, fields).amount, funnel) : null;

  return (
    <div className="flex items-start gap-2 px-1 pb-1">
      <span
        className="mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full shadow-[0_0_0_3px_rgba(255,255,255,0.6)] dark:shadow-none"
        style={{ backgroundColor: stage.color || 'hsl(var(--primary))' }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <h2 className="text-[12.5px] font-semibold leading-snug text-foreground line-clamp-2 break-words" title={stage.name}>
          {stage.name}
        </h2>
        {total && <p className="text-[11px] font-medium tabular-nums text-muted-foreground">{total}</p>}
      </div>
      <span className="mt-px shrink-0 text-[11.5px] font-medium tabular-nums text-muted-foreground" aria-label={`${deals.length} deals`}>
        {deals.length}
      </span>
      <button
        type="button"
        onClick={onAdd}
        className="-mr-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-muted"
        aria-label={`Deal toevoegen aan ${stage.name}`}
        title="Deal toevoegen"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function FunnelBoard({
  stages, deals, funnel, fields, ownerName, nextByDeal, onOpenDeal, onAddDeal, onMoveDeal,
}: FunnelBoardProps) {
  const ordered = [...stages].sort((a, b) => a.position - b.position);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, source, destination } = result;
    if (source.droppableId === destination.droppableId) return;
    const from = stages.find(s => s.id === source.droppableId);
    const to = stages.find(s => s.id === destination.droppableId);
    if (!from || !to) return;
    onMoveDeal(draggableId, from, to);
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div
        className="-mx-4 flex items-start gap-3 overflow-x-auto px-4 pb-4 max-sm:snap-x max-sm:snap-proximity sm:mx-0 sm:px-0 [scrollbar-width:thin]"
        role="list"
        aria-label="Fases"
      >
        {ordered.map(stage => {
          const stageDeals = deals.filter(d => d.stage_id === stage.id);
          return (
            <section
              key={stage.id}
              role="listitem"
              aria-label={stage.name}
              className={cn(
                'flex w-[85vw] shrink-0 snap-start flex-col gap-2 rounded-2xl border p-2.5 sm:w-[280px]',
                'border-white/55 bg-white/[0.28] dark:border-border/50 dark:bg-card/30',
              )}
            >
              <ColumnHeader stage={stage} deals={stageDeals} funnel={funnel} fields={fields} onAdd={() => onAddDeal(stage)} />
              <Droppable droppableId={stage.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      'flex min-h-[72px] flex-col gap-2 rounded-xl transition-colors duration-150 motion-reduce:transition-none',
                      snapshot.isDraggingOver && 'bg-primary/[0.07] ring-1 ring-inset ring-primary/25',
                    )}
                  >
                    {stageDeals.map((deal, i) => (
                      <Draggable key={deal.id} draggableId={deal.id} index={i}>
                        {(p, s) => (
                          <DealCard
                            ref={p.innerRef}
                            {...p.draggableProps}
                            {...p.dragHandleProps}
                            deal={deal}
                            funnel={funnel}
                            fields={fields}
                            ownerName={ownerName(deal.assigned_to)}
                            next={nextByDeal.get(deal.id)}
                            dragging={s.isDragging}
                            onClick={() => onOpenDeal(deal.id)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') onOpenDeal(deal.id);
                            }}
                          />
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {stageDeals.length === 0 && !snapshot.isDraggingOver && (
                      <div className="flex h-[72px] items-center justify-center rounded-xl border border-dashed border-black/10 text-[11.5px] text-muted-foreground dark:border-white/10">
                        Nog geen deals
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </section>
          );
        })}
      </div>
    </DragDropContext>
  );
}
