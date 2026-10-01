import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { Plus, Building2, User, UserPlus, Search, X } from 'lucide-react';
import { useStages, useDeals, useMoveDeal, useCreateDeal, useCreateLead, useCompanies, useBillingTypes, formatFee, type Deal } from '@/hooks/usePipeline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAgenda, type Appointment } from '@/hooks/useAppointments';
import { DealHubDialog } from '@/components/deal/DealHubDialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

function DealCard({ deal, index, onClick, next }: { deal: Deal; index: number; onClick: () => void; next?: Appointment }) {
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
          {next && (
            <p className={cn('text-[11px] mb-1', new Date(next.starts_at) < new Date() ? 'text-destructive' : 'text-primary')}>
              {next.type === 'call' ? '📞' : '👥'} {new Date(next.starts_at).toLocaleString('nl', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
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
  const { data: agenda = [] } = useAgenda();
  const nextByDeal = new Map<string, Appointment>();
  for (const a of agenda) if (a.deal_id && !nextByDeal.has(a.deal_id)) nextByDeal.set(a.deal_id, a); // agenda is sorted by starts_at
  const moveDeal = useMoveDeal();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('deal');
  const selectedDeal = deals.find(d => d.id === selectedId) ?? null;
  const openDeal = (id: string) => setSearchParams(p => { p.set('deal', id); return p; });
  const closeDeal = () => setSearchParams(p => { p.delete('deal'); return p; });
  const [newDealFor, setNewDealFor] = useState<{ stageId: string; stageName: string } | null>(null);
  const [leadOpen, setLeadOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses the search box (unless already typing somewhere)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const q = search.trim().toLowerCase();
  const visibleDeals = q
    ? deals.filter(d =>
        [d.title, d.company?.name, d.contact?.name, d.contact?.email, d.contact?.phone]
          .some(v => v?.toLowerCase().includes(q)))
    : deals;

  const byStage = (stageId: string) => visibleDeals.filter(d => d.stage_id === stageId);

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
          <p className="text-xs text-muted-foreground">
            {q ? `${visibleDeals.length} van ${deals.length}` : deals.length} deals · €{visibleDeals.reduce((s, d) => s + (Number(d.value_eur) || 0), 0).toLocaleString('nl')} totaal
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-40 sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder="Zoek deal, bedrijf, contact…"
              className="h-9 pl-8 pr-8"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && (setSearch(''), e.currentTarget.blur())}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Zoekopdracht wissen"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setLeadOpen(true)} disabled={stages.length === 0}>
          <UserPlus className="h-4 w-4" /> Lead toevoegen
          </Button>
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
                        <DealCard key={deal.id} deal={deal} index={i} onClick={() => openDeal(deal.id)} next={nextByDeal.get(deal.id)} />
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

      <DealHubDialog deal={selectedDeal} open={!!selectedDeal} onClose={closeDeal} onOpenDeal={openDeal} />
    </div>
  );
}
