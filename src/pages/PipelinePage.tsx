import { useState } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { Plus, Euro, Building2, User, MessageSquare, Phone, Mail, ChevronRight } from 'lucide-react';
import { useStages, useDeals, useMoveDeal, useCreateDeal, useAddActivity, useDealActivities, type Deal } from '@/hooks/usePipeline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const ACTIVITY_ICONS: Record<string, any> = {
  note: MessageSquare, call: Phone, email: Mail, meeting: User, stage_change: ChevronRight,
};

function ActivityFeed({ dealId }: { dealId: string }) {
  const { data: activities = [] } = useDealActivities(dealId);
  const addActivity = useAddActivity();
  const [note, setNote] = useState('');
  const [type, setType] = useState('note');

  const submit = () => {
    if (!note.trim()) return;
    addActivity.mutate({ dealId, type, body: note.trim() });
    setNote('');
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Add activity */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="note">Notitie</SelectItem>
              <SelectItem value="call">Bel</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="meeting">Meeting</SelectItem>
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Voeg een notitie toe..."
            value={note}
            onChange={e => setNote(e.target.value)}
            className="text-sm min-h-[60px] flex-1"
          />
        </div>
        <Button size="sm" onClick={submit} disabled={!note.trim() || addActivity.isPending} className="self-end">
          Opslaan
        </Button>
      </div>

      {/* Timeline */}
      <div className="flex flex-col gap-2 mt-1">
        {activities.map(a => {
          const Icon = ACTIVITY_ICONS[a.type] ?? MessageSquare;
          return (
            <div key={a.id} className="flex gap-2.5 text-sm">
              <div className="mt-0.5 h-5 w-5 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Icon className="h-3 w-3 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-foreground/90 break-words">{a.body}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(a.created_at).toLocaleDateString('nl', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
        {activities.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Nog geen activiteit</p>}
      </div>
    </div>
  );
}

function DealCard({ deal, index, onClick }: { deal: Deal; index: number; onClick: () => void }) {
  return (
    <Draggable draggableId={deal.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={cn(
            'bg-card border rounded-lg p-3 cursor-pointer hover:border-primary/50 transition-colors select-none',
            snapshot.isDragging && 'shadow-lg ring-1 ring-primary/20'
          )}
        >
          <p className="text-sm font-medium leading-tight mb-1.5">{deal.title}</p>
          <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
            {deal.company?.name && (
              <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{deal.company.name}</span>
            )}
            {deal.contact?.name && (
              <span className="flex items-center gap-1"><User className="h-3 w-3" />{deal.contact.name}</span>
            )}
            {deal.value_eur != null && (
              <span className="flex items-center gap-1 ml-auto font-medium text-foreground">
                <Euro className="h-3 w-3" />{Number(deal.value_eur).toLocaleString('nl')}
              </span>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}

function NewDealDialog({ stageId, stageName, open, onClose }: { stageId: string; stageName: string; open: boolean; onClose: () => void }) {
  const createDeal = useCreateDeal();
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');

  const submit = () => {
    if (!title.trim()) { toast.error('Naam verplicht'); return; }
    createDeal.mutate({ title: title.trim(), stage_id: stageId, value_eur: value ? Number(value) : null } as any, {
      onSuccess: () => { setTitle(''); setValue(''); onClose(); },
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Nieuwe deal — {stageName}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3 py-1">
          <Input placeholder="Naam van de deal" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          <Input placeholder="Waarde (€)" type="number" value={value} onChange={e => setValue(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button onClick={submit} disabled={createDeal.isPending}>Aanmaken</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PipelinePage() {
  const { data: stages = [] } = useStages();
  const { data: deals = [] } = useDeals();
  const moveDeal = useMoveDeal();
  const [newDealFor, setNewDealFor] = useState<{ stageId: string; stageName: string } | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);

  const byStage = (stageId: string) => deals.filter(d => d.stage_id === stageId);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, source, destination } = result;
    if (source.droppableId === destination.droppableId) return;

    const fromStage = stages.find(s => s.id === source.droppableId);
    const toStage = stages.find(s => s.id === destination.droppableId);
    if (!fromStage || !toStage) return;

    moveDeal.mutate({
      dealId: draggableId,
      stageId: destination.droppableId,
      fromStageName: fromStage.name,
      toStageName: toStage.name,
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div>
          <h1 className="text-lg font-semibold">Pipeline</h1>
          <p className="text-xs text-muted-foreground">{deals.length} deals · €{deals.reduce((s, d) => s + (Number(d.value_eur) || 0), 0).toLocaleString('nl')} totaal</p>
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 p-4 overflow-x-auto flex-1 min-h-0">
          {stages.map(stage => {
            const stageDeals = byStage(stage.id);
            return (
              <div key={stage.id} className="flex flex-col w-64 shrink-0">
                {/* Column header */}
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} />
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{stage.name}</span>
                    <Badge variant="secondary" className="text-xs px-1.5 py-0">{stageDeals.length}</Badge>
                  </div>
                  <button
                    onClick={() => setNewDealFor({ stageId: stage.id, stageName: stage.name })}
                    className="h-5 w-5 rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Cards */}
                <Droppable droppableId={stage.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        'flex flex-col gap-2 flex-1 min-h-[80px] rounded-lg p-1.5 transition-colors',
                        snapshot.isDraggingOver ? 'bg-muted/60' : 'bg-muted/20'
                      )}
                    >
                      {stageDeals.map((deal, i) => (
                        <DealCard key={deal.id} deal={deal} index={i} onClick={() => setSelectedDeal(deal)} />
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}

          {stages.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Geen stages gevonden. Voeg ze toe via Instellingen.
            </div>
          )}
        </div>
      </DragDropContext>

      {/* New deal dialog */}
      {newDealFor && (
        <NewDealDialog
          stageId={newDealFor.stageId}
          stageName={newDealFor.stageName}
          open={!!newDealFor}
          onClose={() => setNewDealFor(null)}
        />
      )}

      {/* Deal detail sheet */}
      <Sheet open={!!selectedDeal} onOpenChange={v => !v && setSelectedDeal(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selectedDeal && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle>{selectedDeal.title}</SheetTitle>
                {selectedDeal.value_eur != null && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Euro className="h-3.5 w-3.5" />€{Number(selectedDeal.value_eur).toLocaleString('nl')}
                  </p>
                )}
              </SheetHeader>
              <ActivityFeed dealId={selectedDeal.id} />
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
