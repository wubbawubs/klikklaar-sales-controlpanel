import { useState } from 'react';
import { Check, ChevronsUpDown, AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { KIND_LABEL, CONFIRM_CLOSED, describeProposal, filterCompanies, proposalBlockers, stageKind, type ProposalPayload } from '@/lib/meetingProposals';
import type { MeetingProposal, ProposalDraft } from '@/hooks/useMeetings';

export interface CardDeal { id: string; title: string; company_id: string | null; stage_id: string | null; value_eur: number | null; assigned_to: string | null }
export interface CardStage { id: string; name: string; position: number; color: string }
export interface CardMember { user_id: string; full_name: string | null; email: string | null }

interface Props {
  proposal: MeetingProposal;
  draft: ProposalDraft;
  onDraftChange: (d: ProposalDraft) => void;
  onApply: () => void;
  onDismiss: () => void;
  onRestore: () => void;
  applying: boolean;
  companies: { id: string; name: string }[];
  deals: CardDeal[];
  stages: CardStage[];
  team: CardMember[];
}

const NONE = '__none__';
const memberName = (m: CardMember) => m.full_name || m.email || 'Onbekend';

function CompanyPicker({ value, candidates, companies, onChange }: {
  value: string | null; candidates: string[]; companies: { id: string; name: string }[]; onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const current = value ? companies.find(c => c.id === value) : undefined;
  const shown = filterCompanies(companies, query, candidates);
  const pick = (id: string) => { onChange(id); setOpen(false); setQuery(''); };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="justify-between w-full sm:w-64 font-normal">
          <span className="truncate">{current ? current.name : 'Kies klant…'}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-72" align="start">
        {/* Filtering is ours (whole list); cmdk would only filter what is rendered. */}
        <Command shouldFilter={false}>
          <CommandInput placeholder="Zoek klant…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>Geen klant gevonden</CommandEmpty>
            <CommandGroup>
              {shown.map(c => (
                <CommandItem key={c.id} value={c.id} onSelect={() => pick(c.id)}>
                  <Check className={cn('h-3.5 w-3.5 mr-1', value === c.id ? 'opacity-100' : 'opacity-0')} />
                  {c.name}
                  {candidates.includes(c.id) && <span className="ml-auto text-[10px] text-muted-foreground">mogelijk bedoeld</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function ProposalCard({ proposal, draft, onDraftChange, onApply, onDismiss, onRestore, applying, companies, deals, stages, team }: Props) {
  const [editingCompany, setEditingCompany] = useState(false);
  const pl = draft.payload;
  const setPayload = (patch: Partial<ProposalPayload>) => onDraftChange({ ...draft, payload: { ...pl, ...patch } });
  const stageName = (id: string) => stages.find(s => s.id === id)?.name ?? null;
  const userName = (id: string) => { const m = team.find(t => t.user_id === id); return m ? memberName(m) : null; };

  const deal = draft.deal_id ? deals.find(d => d.id === draft.deal_id) : undefined;
  const dealStageName = deal?.stage_id ? stageName(deal.stage_id) : null;
  const blockers = proposalBlockers({ kind: proposal.kind, company_id: draft.company_id, deal_id: draft.deal_id, payload: pl },
    { dealStageName, confirmClosed: draft.confirm_closed });
  const companyDeals = draft.company_id ? deals.filter(d => d.company_id === draft.company_id) : [];
  const isNew = proposal.kind === 'new_deal';
  const done = proposal.status === 'applied';
  const dismissed = proposal.status === 'dismissed';

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary">{KIND_LABEL[proposal.kind]}</Badge>
      <span className="text-sm font-medium">{describeProposal({ kind: proposal.kind, payload: pl }, { stageName, userName })}</span>
      {deal && <span className="text-xs text-muted-foreground">· {deal.title}{dealStageName ? ` (${dealStageName})` : ''}</span>}
    </div>
  );

  if (done) {
    return (
      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center justify-between gap-2">
        {header}
        <span className="text-xs font-medium text-emerald-600 flex items-center gap-1"><Check className="h-3.5 w-3.5" />Toegepast</span>
      </div>
    );
  }
  if (dismissed) {
    return (
      <div className="rounded-md border border-dashed p-3 flex items-center justify-between gap-2 opacity-60">
        {header}
        <Button variant="ghost" size="sm" onClick={onRestore}><RotateCcw className="h-3.5 w-3.5 mr-1" />Terugzetten</Button>
      </div>
    );
  }

  const ownerSelect = (value: string | null | undefined, onChange: (v: string) => void) => (
    <Select value={value ?? NONE} onValueChange={v => onChange(v === NONE ? '' : v)}>
      <SelectTrigger className="h-8 w-44"><SelectValue placeholder="Eigenaar" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Kies eigenaar…</SelectItem>
        {team.map(m => <SelectItem key={m.user_id} value={m.user_id}>{memberName(m)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
  const stageSelect = (value: string | null | undefined, onChange: (v: string | null) => void) => (
    <Select value={value ?? NONE} onValueChange={v => onChange(v === NONE ? null : v)}>
      <SelectTrigger className="h-8 w-48"><SelectValue placeholder="Fase" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Kies fase…</SelectItem>
        {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className={cn('rounded-md border p-3 space-y-3', proposal.status === 'failed' && 'border-destructive/50')}>
      {header}
      {proposal.quote && <p className="text-xs italic text-muted-foreground">“{proposal.quote}”</p>}

      {!isNew && (
        <div className="flex flex-wrap items-center gap-2">
          {(!draft.company_id || editingCompany) ? (
            <CompanyPicker value={draft.company_id} candidates={proposal.candidates} companies={companies}
              onChange={id => {
                const open = deals.filter(d => d.company_id === id && !stageKind(d.stage_id ? stageName(d.stage_id) : null));
                onDraftChange({ ...draft, company_id: id, deal_id: open.length === 1 ? open[0].id : null, confirm_closed: false });
                setEditingCompany(false);
              }} />
          ) : (
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setEditingCompany(true)}>Andere klant kiezen</Button>
          )}
          {draft.company_id && (
            <Select value={draft.deal_id ?? NONE} onValueChange={v => onDraftChange({ ...draft, deal_id: v === NONE ? null : v, confirm_closed: false })}>
              <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Deal" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Kies deal…</SelectItem>
                {companyDeals.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.title}{d.stage_id ? ` · ${stageName(d.stage_id)}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {draft.company_id && companyDeals.length === 0 && <span className="text-xs text-muted-foreground">Deze klant heeft geen deals</span>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {proposal.kind === 'stage' && stageSelect(pl.stage_id, v => setPayload({ stage_id: v }))}
        {proposal.kind === 'lost' && (
          <Input className="h-8 w-64" placeholder="Reden (optioneel)" value={pl.lost_reason ?? ''} onChange={e => setPayload({ lost_reason: e.target.value })} />
        )}
        {proposal.kind === 'value' && (
          <Input className="h-8 w-36" type="number" min={1} placeholder="Bedrag €" value={pl.value_eur ?? ''}
            onChange={e => setPayload({ value_eur: e.target.value === '' ? null : Number(e.target.value) })} />
        )}
        {proposal.kind === 'owner' && ownerSelect(pl.user_id, v => setPayload({ user_id: v || null }))}
        {proposal.kind === 'note' && (
          <Textarea className="min-h-[60px]" value={pl.body ?? ''} onChange={e => setPayload({ body: e.target.value })} />
        )}
        {proposal.kind === 'appointment' && (
          <>
            <Select value={pl.appointment_type ?? 'call'} onValueChange={v => setPayload({ appointment_type: v as 'call' | 'meeting' })}>
              <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="call">📞 Call</SelectItem><SelectItem value="meeting">👥 Meeting</SelectItem></SelectContent>
            </Select>
            <Input className="h-8 w-40" type="date" value={pl.date ?? ''} onChange={e => setPayload({ date: e.target.value || null })} />
            <Input className="h-8 w-28" type="time" step={900} aria-label="Tijd" value={pl.time ?? ''} onChange={e => setPayload({ time: e.target.value || null })} />
            {ownerSelect(pl.user_id, v => setPayload({ user_id: v || null }))}
            <Input className="h-8 w-56" placeholder="Titel" value={pl.title ?? ''} onChange={e => setPayload({ title: e.target.value })} />
          </>
        )}
        {isNew && (
          <>
            <Input className="h-8 w-48" placeholder="Bedrijfsnaam" value={pl.company_name ?? ''} onChange={e => setPayload({ company_name: e.target.value })} />
            <Input className="h-8 w-48" placeholder="Contactpersoon (optioneel)" value={pl.contact_name ?? ''} onChange={e => setPayload({ contact_name: e.target.value })} />
            <Input className="h-8 w-48" placeholder="Dealnaam" value={pl.deal_title ?? ''} onChange={e => setPayload({ deal_title: e.target.value })} />
            {stageSelect(pl.stage_id, v => setPayload({ stage_id: v }))}
            <Input className="h-8 w-32" type="number" min={1} placeholder="Bedrag €" value={pl.value_eur ?? ''}
              onChange={e => setPayload({ value_eur: e.target.value === '' ? null : Number(e.target.value) })} />
            <Textarea className="min-h-[50px]" placeholder="Notitie (optioneel)" value={pl.body ?? ''} onChange={e => setPayload({ body: e.target.value })} />
          </>
        )}
      </div>

      {deal && stageKind(dealStageName) && ['stage', 'won', 'lost'].includes(proposal.kind) && (
        <label className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
          <Checkbox checked={draft.confirm_closed} onCheckedChange={v => onDraftChange({ ...draft, confirm_closed: v === true })} />
          Bevestig: deze deal staat al op {dealStageName}
        </label>
      )}

      {proposal.status === 'failed' && proposal.error && (
        <p className="text-xs text-destructive flex items-start gap-1"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{proposal.error}</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {blockers.filter(b => b !== CONFIRM_CLOSED).map(b => (
            <span key={b} className="text-xs rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 px-1.5 py-0.5">{b}</span>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onDismiss} disabled={applying}>Negeren</Button>
          <Button size="sm" onClick={onApply} disabled={blockers.length > 0 || applying}>
            {proposal.status === 'failed' ? 'Opnieuw proberen' : 'Toepassen'}
          </Button>
        </div>
      </div>
    </div>
  );
}
