import { useState } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { Plus, Euro, Building2, User, MessageSquare, Phone, Mail, ChevronRight, Linkedin, UserPlus } from 'lucide-react';
import { useStages, useDeals, useMoveDeal, useCreateDeal, useUpdateDeal, useCreateLead, useCompanies, useBillingTypes, useAddActivity, useDealActivities, formatFee, type Deal } from '@/hooks/usePipeline';
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
                {formatFee(deal.value_eur, deal.billing_type)}
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

const NEW_COMPANY = '__new__';
const NONE = '__none__';

// Editable deal detail: all fields editable (like the create form) + notes feed.
function DealSheetBody({ deal, stages, onClose }: {
  deal: Deal; stages: { id: string; name: string }[]; onClose: () => void;
}) {
  const update = useUpdateDeal();
  const { data: companies = [] } = useCompanies();
  const { data: billingTypes = [] } = useBillingTypes();
  const [title, setTitle] = useState(deal.title);
  const [value, setValue] = useState(deal.value_eur != null ? String(deal.value_eur) : '');
  const [stageId, setStageId] = useState(deal.stage_id ?? '');
  const [companyId, setCompanyId] = useState(deal.company_id ?? NONE);
  const [billingTypeId, setBillingTypeId] = useState(deal.billing_type_id ?? NONE);

  const save = () => {
    if (!title.trim()) { toast.error('Naam verplicht'); return; }
    update.mutate({
      id: deal.id,
      title: title.trim(),
      value_eur: value === '' ? null : Number(value),
      stage_id: stageId || deal.stage_id || undefined,
      company_id: companyId === NONE ? null : companyId,
      billing_type_id: billingTypeId === NONE ? null : billingTypeId,
    }, { onSuccess: onClose });
  };

  return (
    <>
      <SheetHeader className="mb-4"><SheetTitle>Deal bewerken</SheetTitle></SheetHeader>
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Titel</label>
          <Input value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Waarde (€)</label>
            <Input type="number" value={value} onChange={e => setValue(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Tarieftype</label>
            <Select value={billingTypeId} onValueChange={setBillingTypeId}>
              <SelectTrigger><SelectValue placeholder="Geen" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Geen</SelectItem>
                {billingTypes.map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}{b.kind === 'recurring' && b.interval ? ` (${b.interval === 'month' ? '/mnd' : '/jr'})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Stage</label>
            <Select value={stageId} onValueChange={setStageId}>
              <SelectTrigger><SelectValue placeholder="Kies stage" /></SelectTrigger>
              <SelectContent>
                {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Bedrijf</label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger><SelectValue placeholder="Geen" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Geen</SelectItem>
                {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button size="sm" className="self-end" onClick={save} disabled={update.isPending}>
          {update.isPending ? 'Opslaan…' : 'Opslaan'}
        </Button>
      </div>

      <div className="border-t my-4" />
      <h3 className="text-sm font-semibold mb-2">Notities & activiteit</h3>
      <ActivityFeed dealId={deal.id} />
    </>
  );
}

function LeadDialog({ open, onClose, stages, defaultStageId }: {
  open: boolean; onClose: () => void;
  stages: { id: string; name: string }[]; defaultStageId: string;
}) {
  const createLead = useCreateLead();
  const { data: companies = [] } = useCompanies();
  const { data: billingTypes = [] } = useBillingTypes();
  const [billingTypeId, setBillingTypeId] = useState<string>('');
  const [companyId, setCompanyId] = useState<string>(NEW_COMPANY);
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [stageId, setStageId] = useState(defaultStageId);

  const reset = () => {
    setCompanyId(NEW_COMPANY); setCompanyName(''); setContactName(''); setEmail('');
    setLinkedin(''); setPhone(''); setTitle(''); setValue(''); setStageId(defaultStageId); setBillingTypeId('');
  };

  const submit = () => {
    const isNew = companyId === NEW_COMPANY;
    if (!title.trim() && !companyName.trim() && !contactName.trim()) {
      toast.error('Vul minstens bedrijf of dealnaam in'); return;
    }
    createLead.mutate({
      companyId: isNew ? null : companyId,
      companyName: isNew ? companyName : undefined,
      contactName, email, linkedin, phone,
      title: title.trim() || companyName.trim() || contactName.trim(),
      valueEur: value ? Number(value) : null,
      billingTypeId: billingTypeId || null,
      stageId: stageId || defaultStageId,
    }, { onSuccess: () => { reset(); onClose(); } });
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><UserPlus className="h-4 w-4" /> Nieuwe lead</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-1">
          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Bedrijf</label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NEW_COMPANY}>+ Nieuw bedrijf…</SelectItem>
                {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {companyId === NEW_COMPANY && (
              <Input placeholder="Bedrijfsnaam" value={companyName} onChange={e => setCompanyName(e.target.value)} autoFocus />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Contactpersoon" value={contactName} onChange={e => setContactName(e.target.value)} />
            <Input placeholder="E-mail" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="LinkedIn URL" value={linkedin} onChange={e => setLinkedin(e.target.value)} />
            <Input placeholder="Telefoon" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <Input placeholder="Deal / titel" value={title} onChange={e => setTitle(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Waarde (€)" type="number" value={value} onChange={e => setValue(e.target.value)} />
            <Select value={billingTypeId} onValueChange={setBillingTypeId}>
              <SelectTrigger><SelectValue placeholder="Tarieftype" /></SelectTrigger>
              <SelectContent>
                {billingTypes.map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}{b.kind === 'recurring' && b.interval ? ` (${b.interval === 'month' ? '/mnd' : '/jr'})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Stage</label>
            <Select value={stageId} onValueChange={setStageId}>
              <SelectTrigger><SelectValue placeholder="Kies stage" /></SelectTrigger>
              <SelectContent>
                {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button onClick={submit} disabled={createLead.isPending}>{createLead.isPending ? 'Toevoegen…' : 'Lead toevoegen'}</Button>
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
  const [leadOpen, setLeadOpen] = useState(false);

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
          <h1 className="text-xl font-semibold">Pipeline</h1>
          <p className="text-xs text-muted-foreground">{deals.length} deals · €{deals.reduce((s, d) => s + (Number(d.value_eur) || 0), 0).toLocaleString('nl')} totaal</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setLeadOpen(true)} disabled={stages.length === 0}>
          <UserPlus className="h-4 w-4" /> Lead toevoegen
        </Button>
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

      {/* New deal dialog (quick add per column) */}
      {newDealFor && (
        <NewDealDialog
          stageId={newDealFor.stageId}
          stageName={newDealFor.stageName}
          open={!!newDealFor}
          onClose={() => setNewDealFor(null)}
        />
      )}

      {/* Full lead dialog */}
      {stages.length > 0 && (
        <LeadDialog
          open={leadOpen}
          onClose={() => setLeadOpen(false)}
          stages={stages}
          defaultStageId={stages[0]!.id}
        />
      )}

      {/* Deal detail + edit sheet */}
      <Sheet open={!!selectedDeal} onOpenChange={v => !v && setSelectedDeal(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selectedDeal && (
            <DealSheetBody
              key={selectedDeal.id}
              deal={selectedDeal}
              stages={stages}
              onClose={() => setSelectedDeal(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
